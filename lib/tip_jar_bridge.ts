interface JsonRecord {
  [key: string]: unknown;
}

export interface MoneroTipAddress {
  address: string;
  source: 'bridge' | 'fallback';
  fetchedAt: string;
  label?: string | null;
  accountIndex?: number | null;
  subaddressIndex?: number | null;
  bridgeHost?: string | null;
  warning?: string;
}

interface TipBridgeConfig {
  baseUrl: string;
  authToken?: string;
  moneroCurrentPath: string;
  timeoutMs: number;
  fallbackAddress?: string;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function readString(record: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function readNumber(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizeTimeout(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

function resolveTipBridgeConfig(): TipBridgeConfig | null {
  const baseUrl = Deno.env.get('TIP_BRIDGE_URL')?.trim() || '';
  const fallbackAddress = Deno.env.get('TIP_JAR_MONERO_FALLBACK')?.trim() || undefined;

  if (!baseUrl && !fallbackAddress) {
    return null;
  }

  return {
    baseUrl,
    authToken: Deno.env.get('TIP_BRIDGE_AUTH_TOKEN')?.trim() || undefined,
    moneroCurrentPath: Deno.env.get('TIP_BRIDGE_MONERO_CURRENT_PATH')?.trim() || '/monero/current-tip-address',
    timeoutMs: normalizeTimeout(Deno.env.get('TIP_BRIDGE_TIMEOUT_MS')),
    fallbackAddress,
  };
}

function extractMoneroAddress(payload: unknown): Omit<MoneroTipAddress, 'source' | 'fetchedAt' | 'warning'> | null {
  const topLevel = asRecord(payload);
  const nestedData = topLevel ? asRecord(topLevel.data) : null;
  const nestedMonero = topLevel ? asRecord(topLevel.monero) : null;
  const nestedDataMonero = nestedData ? asRecord(nestedData.monero) : null;

  const candidates = [topLevel, nestedData, nestedMonero, nestedDataMonero].filter(
    (candidate): candidate is JsonRecord => candidate !== null,
  );

  for (const candidate of candidates) {
    const address = readString(candidate, 'address', 'subaddress', 'moneroAddress', 'currentAddress');
    if (!address) continue;

    return {
      address,
      label: readString(candidate, 'label', 'name'),
      accountIndex: readNumber(candidate, 'accountIndex', 'major'),
      subaddressIndex: readNumber(candidate, 'subaddressIndex', 'index', 'minor'),
    };
  }

  return null;
}

async function fetchBridgeJson(
  url: string,
  authToken: string | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bridge responded with ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getCurrentMoneroTipAddress(): Promise<MoneroTipAddress> {
  const config = resolveTipBridgeConfig();
  if (!config) {
    throw new Error('Tip bridge not configured');
  }

  const fetchedAt = new Date().toISOString();

  if (!config.baseUrl) {
    return {
      address: config.fallbackAddress!,
      source: 'fallback',
      fetchedAt,
      warning: 'Bridge not configured; serving fallback Monero address.',
    };
  }

  let bridgeUrl: URL;
  try {
    bridgeUrl = new URL(config.moneroCurrentPath, config.baseUrl);
  } catch {
    throw new Error('Invalid tip bridge URL configuration');
  }

  try {
    const payload = await fetchBridgeJson(bridgeUrl.toString(), config.authToken, config.timeoutMs);
    const monero = extractMoneroAddress(payload);

    if (!monero) {
      throw new Error('Bridge payload missing Monero address');
    }

    return {
      ...monero,
      source: 'bridge',
      fetchedAt,
      bridgeHost: bridgeUrl.host,
    };
  } catch (_error) {
    if (config.fallbackAddress) {
      return {
        address: config.fallbackAddress,
        source: 'fallback',
        fetchedAt,
        bridgeHost: bridgeUrl.host,
        warning: 'Bridge unavailable; serving fallback Monero address.',
      };
    }

    throw new Error('Failed to load Monero address from bridge');
  }
}

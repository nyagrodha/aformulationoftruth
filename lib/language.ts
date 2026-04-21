export const LANGUAGE_COOKIE = 'a4m_lang_mode';

export const LANGUAGE_MODES = [
  'all',
  'tamil-only',
  'tamil-translit',
  'english-only',
  'spanish-only',
] as const;

export type LanguageMode = typeof LANGUAGE_MODES[number];

export interface LanguagePreference {
  mode: LanguageMode;
  htmlLang: 'en' | 'es' | 'ta';
  source: 'query' | 'cookie' | 'country' | 'accept-language' | 'default';
  countryCode?: string;
}

const SPANISH_COUNTRIES = new Set([
  'AR',
  'BO',
  'CL',
  'CO',
  'CR',
  'CU',
  'DO',
  'EC',
  'ES',
  'GQ',
  'GT',
  'HN',
  'MX',
  'NI',
  'PA',
  'PE',
  'PR',
  'PY',
  'SV',
  'UY',
  'VE',
]);

const TAMIL_REGIONS = new Set(['IN', 'LK', 'MY', 'SG']);

const COUNTRY_HEADERS = [
  'cf-ipcountry',
  'cloudfront-viewer-country',
  'x-vercel-ip-country',
  'x-country-code',
  'x-country',
] as const;

const MODE_BY_QUERY: Record<string, LanguageMode> = {
  all: 'all',
  ta: 'tamil-only',
  tamil: 'tamil-only',
  'ta-tr': 'tamil-translit',
  translit: 'tamil-translit',
  en: 'english-only',
  english: 'english-only',
  es: 'spanish-only',
  spanish: 'spanish-only',
};

export function sanitizeLanguageMode(value: string | null | undefined): LanguageMode | null {
  if (!value) return null;
  return (LANGUAGE_MODES as readonly string[]).includes(value) ? (value as LanguageMode) : null;
}

export function htmlLangForMode(mode: LanguageMode): 'en' | 'es' | 'ta' {
  if (mode === 'spanish-only') return 'es';
  if (mode === 'tamil-only' || mode === 'tamil-translit' || mode === 'all') return 'ta';
  return 'en';
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function detectCountry(headers: Headers): string | undefined {
  for (const header of COUNTRY_HEADERS) {
    const value = headers.get(header)?.trim().toUpperCase();
    if (value && value.length === 2 && value !== 'XX' && value !== 'T1') {
      return value;
    }
  }
  return undefined;
}

function detectModeFromCountry(countryCode?: string): LanguageMode | null {
  if (!countryCode) return null;
  if (SPANISH_COUNTRIES.has(countryCode)) return 'spanish-only';
  if (TAMIL_REGIONS.has(countryCode)) return 'tamil-translit';
  return null;
}

function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((entry) => {
      const [tag, quality] = entry.trim().split(';q=');
      return {
        tag: tag.toLowerCase(),
        quality: quality ? Number.parseFloat(quality) : 1,
      };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

function detectModeFromAcceptLanguage(header: string | null): LanguageMode | null {
  const tags = parseAcceptLanguage(header);
  for (const tag of tags) {
    if (tag.startsWith('es')) return 'spanish-only';
    if (tag.startsWith('ta')) return 'tamil-translit';
  }
  return null;
}

function detectQueryMode(req: Request): LanguageMode | null {
  const url = new URL(req.url);
  const raw = url.searchParams.get('lang')?.trim().toLowerCase();
  if (!raw) return null;
  return MODE_BY_QUERY[raw] || sanitizeLanguageMode(raw);
}

export function resolveLanguagePreference(req: Request): LanguagePreference {
  const queryMode = detectQueryMode(req);
  if (queryMode) {
    return { mode: queryMode, htmlLang: htmlLangForMode(queryMode), source: 'query' };
  }

  const cookieMode = sanitizeLanguageMode(getCookie(req.headers.get('Cookie'), LANGUAGE_COOKIE));
  if (cookieMode) {
    return { mode: cookieMode, htmlLang: htmlLangForMode(cookieMode), source: 'cookie' };
  }

  const countryCode = detectCountry(req.headers);
  const countryMode = detectModeFromCountry(countryCode);
  if (countryMode) {
    return {
      mode: countryMode,
      htmlLang: htmlLangForMode(countryMode),
      source: 'country',
      countryCode,
    };
  }

  const acceptLanguageMode = detectModeFromAcceptLanguage(req.headers.get('Accept-Language'));
  if (acceptLanguageMode) {
    return {
      mode: acceptLanguageMode,
      htmlLang: htmlLangForMode(acceptLanguageMode),
      source: 'accept-language',
      countryCode,
    };
  }

  return {
    mode: 'english-only',
    htmlLang: 'en',
    source: 'default',
    countryCode,
  };
}

export function shouldSecureCookies(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === 'https:') {
    return true;
  }

  if (isLocalHostname(url.hostname)) {
    return false;
  }

  return Deno.env.get('DENO_ENV') === 'production' ||
    Deno.env.get('NODE_ENV') === 'production';
}

export function buildLanguageCookie(req: Request, mode: LanguageMode): string {
  const parts = [
    `${LANGUAGE_COOKIE}=${encodeURIComponent(mode)}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ];
  if (shouldSecureCookies(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function withLanguageCookie(
  headersInit: HeadersInit | undefined,
  req: Request,
  mode: LanguageMode,
): Headers {
  const headers = new Headers(headersInit);
  const existing = sanitizeLanguageMode(getCookie(req.headers.get('Cookie'), LANGUAGE_COOKIE));
  if (existing !== mode) {
    headers.append('Set-Cookie', buildLanguageCookie(req, mode));
  }
  return headers;
}

export function getLanguageClientScript(
  currentMode: LanguageMode,
  options: { reloadOnChange?: boolean } = {},
): string {
  const reloadOnChange = options.reloadOnChange ?? true;
  return `
    (() => {
      const STORAGE_KEY = '${LANGUAGE_COOKIE}';
      const COOKIE_NAME = '${LANGUAGE_COOKIE}';
      const buttons = document.querySelectorAll('[data-lang-mode-option]');
      if (!buttons.length) return;

      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      const currentMode = ${JSON.stringify(currentMode)};

      const applyLocalState = (mode) => {
        document.documentElement.dataset.langMode = mode;
        document.body.dataset.langMode = mode;
        buttons.forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.langModeOption === mode));
        });
      };

      applyLocalState(currentMode);

      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const nextMode = button.dataset.langModeOption;
          if (!nextMode || nextMode === currentMode) return;

          localStorage.setItem(STORAGE_KEY, nextMode);
          document.cookie = COOKIE_NAME + '=' + encodeURIComponent(nextMode) + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
          applyLocalState(nextMode);
          ${reloadOnChange ? 'window.location.reload();' : ''}
        });
      });
    })();
  `;
}

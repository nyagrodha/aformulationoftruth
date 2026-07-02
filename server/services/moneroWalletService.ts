import crypto from 'crypto';
// Talks to a monero-wallet-rpc instance over JSON-RPC using native fetch.
// The wallet can live anywhere reachable from this server (e.g. a home
// machine exposed through a VPN/tunnel) — see MONERO_TIPS_SETUP.md.

interface MoneroWalletConfig {
  rpcUrl: string;
  rpcUsername: string;
  rpcPassword: string;
  accountIndex: number;
}

export interface TipAddress {
  address: string;
  addressIndex: number;
  accountIndex: number;
}

interface JsonRpcResponse<T> {
  id: string;
  jsonrpc: string;
  result?: T;
  error?: { code: number; message: string };
}

export class MoneroWalletService {
  private config: MoneroWalletConfig;
  public readonly isConfigured: boolean;

  constructor() {
    this.config = {
      rpcUrl: (process.env.MONERO_WALLET_RPC_URL || '').replace(/\/$/, ''),
      rpcUsername: process.env.MONERO_WALLET_RPC_USERNAME || '',
      rpcPassword: process.env.MONERO_WALLET_RPC_PASSWORD || '',
      accountIndex: Number.parseInt(process.env.MONERO_WALLET_ACCOUNT_INDEX || '0', 10),
    };

    // Monero tips are optional — routes return 503 when unconfigured
    this.isConfigured = !!this.config.rpcUrl;
  }

  // monero-wallet-rpc started with --rpc-login only accepts HTTP digest auth
  // (RFC 7616, MD5 + qop=auth), which fetch does not speak natively.
  private buildDigestHeader(challenge: string, method: string, uri: string): string | null {
    const params: Record<string, string> = {};
    for (const match of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) {
      params[match[1]] = match[2] ?? match[3];
    }
    if (!params.realm || !params.nonce) {
      return null;
    }

    const md5 = (data: string) => crypto.createHash('md5').update(data).digest('hex');
    const cnonce = crypto.randomBytes(8).toString('hex');
    const nc = '00000001';
    const ha1 = md5(`${this.config.rpcUsername}:${params.realm}:${this.config.rpcPassword}`);
    const ha2 = md5(`${method}:${uri}`);
    const qop = params.qop ? 'auth' : undefined;
    const response = qop
      ? md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : md5(`${ha1}:${params.nonce}:${ha2}`);

    const parts = [
      `username="${this.config.rpcUsername}"`,
      `realm="${params.realm}"`,
      `nonce="${params.nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`,
      'algorithm=MD5',
    ];
    if (qop) {
      parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    }
    if (params.opaque) {
      parts.push(`opaque="${params.opaque}"`);
    }
    return `Digest ${parts.join(', ')}`;
  }

  private async rpcCall<T>(rpcMethod: string, rpcParams: Record<string, unknown> = {}): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Monero wallet RPC is not configured');
    }

    const url = `${this.config.rpcUrl}/json_rpc`;
    const body = JSON.stringify({ jsonrpc: '2.0', id: '0', method: rpcMethod, params: rpcParams });
    const doPost = (headers: Record<string, string>) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    };

    let response = await doPost({});

    if (response.status === 401 && this.config.rpcUsername) {
      const challenge = response.headers.get('www-authenticate');
      const authHeader = challenge && this.buildDigestHeader(challenge, 'POST', '/json_rpc');
      if (authHeader) {
        response = await doPost({ Authorization: authHeader });
      }
    }

    if (!response.ok) {
      throw new Error(`Monero wallet RPC HTTP error: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (payload.error) {
      throw new Error(`Monero wallet RPC error ${payload.error.code}: ${payload.error.message}`);
    }
    if (payload.result === undefined) {
      throw new Error('Monero wallet RPC returned no result');
    }
    return payload.result;
  }

  // Generate a fresh subaddress so each tip is unlinkable to previous ones
  async createTipAddress(label: string): Promise<TipAddress> {
    const result = await this.rpcCall<{ address: string; address_index: number }>('create_address', {
      account_index: this.config.accountIndex,
      label,
    });

    return {
      address: result.address,
      addressIndex: result.address_index,
      accountIndex: this.config.accountIndex,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.rpcCall<{ version: number }>('get_version');
      return true;
    } catch (error) {
      console.error('Monero wallet RPC health check failed:', error);
      return false;
    }
  }
}

export const moneroWalletService = new MoneroWalletService();

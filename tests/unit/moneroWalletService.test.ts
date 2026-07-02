import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MoneroWalletService } from '../../server/services/moneroWalletService';

const RPC_URL = 'http://127.0.0.1:18083';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('MoneroWalletService', () => {
  const originalEnv = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv, MONERO_WALLET_RPC_URL: RPC_URL };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('is not configured without MONERO_WALLET_RPC_URL', async () => {
    delete process.env.MONERO_WALLET_RPC_URL;
    const service = new MoneroWalletService();

    expect(service.isConfigured).toBe(false);
    await expect(service.createTipAddress('tip:test')).rejects.toThrow('not configured');
  });

  it('creates a tip address via create_address', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: '0',
        jsonrpc: '2.0',
        result: { address: '87TipSubaddress', address_index: 7 },
      })
    );

    const service = new MoneroWalletService();
    const tip = await service.createTipAddress('tip:test');

    expect(tip).toEqual({ address: '87TipSubaddress', addressIndex: 7, accountIndex: 0 });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${RPC_URL}/json_rpc`);
    const body = JSON.parse(options.body as string);
    expect(body.method).toBe('create_address');
    expect(body.params).toEqual({ account_index: 0, label: 'tip:test' });
  });

  it('retries with a digest Authorization header after a 401 challenge', async () => {
    process.env.MONERO_WALLET_RPC_USERNAME = 'tipuser';
    process.env.MONERO_WALLET_RPC_PASSWORD = 'secret';

    fetchMock
      .mockResolvedValueOnce(
        new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Digest qop="auth", algorithm=MD5, realm="monero-rpc", nonce="abc123", stale=false',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: '0',
          jsonrpc: '2.0',
          result: { address: '88AuthedSubaddress', address_index: 1 },
        })
      );

    const service = new MoneroWalletService();
    const tip = await service.createTipAddress('tip:test');

    expect(tip.address).toBe('88AuthedSubaddress');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryHeaders = (fetchMock.mock.calls[1] as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(retryHeaders.Authorization).toMatch(/^Digest /);
    expect(retryHeaders.Authorization).toContain('username="tipuser"');
    expect(retryHeaders.Authorization).toContain('realm="monero-rpc"');
    expect(retryHeaders.Authorization).toContain('nonce="abc123"');
    expect(retryHeaders.Authorization).toContain('qop=auth');
    expect(retryHeaders.Authorization).toMatch(/response="[0-9a-f]{32}"/);
  });

  it('propagates wallet RPC errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: '0',
        jsonrpc: '2.0',
        error: { code: -21, message: 'Wallet is busy' },
      })
    );

    const service = new MoneroWalletService();
    await expect(service.createTipAddress('tip:test')).rejects.toThrow('Wallet is busy');
  });

  it('reports unhealthy when the wallet is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const service = new MoneroWalletService();
    await expect(service.healthCheck()).resolves.toBe(false);
  });
});

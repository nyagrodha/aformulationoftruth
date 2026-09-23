import { assertEquals } from '$std/assert/mod.ts';
import { brooch, handler } from './status.ts';

const CODE = 'AAAAAQAAAAFx9TXanbdHdONdZuM';

function post(body: string, type = 'application/json', headers?: Record<string, string>) {
  return new Request('http://localhost/api/brooch/status', {
    method: 'POST',
    headers: { 'Content-Type': type, ...headers },
    body,
  });
}

function postStreamed(size: number) {
  return new Request('http://localhost/api/brooch/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new ReadableStream({
      start(c) {
        for (let i = 0; i < Math.ceil(size / 1024); i++) {
          c.enqueue(new Uint8Array(Math.min(1024, size - i * 1024)));
        }
        c.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
}

const ctx = {} as never;

Deno.test('a valid code returns its state, uncached', async () => {
  brooch.status = () => Promise.resolve('redeemed');
  const res = await handler.POST!(post(JSON.stringify({ code: CODE })), ctx);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { state: 'redeemed' });
  assertEquals(res.headers.get('Cache-Control'), 'no-store');
});

Deno.test('a refused code is 404', async () => {
  brooch.status = () => Promise.resolve(null);
  const res = await handler.POST!(post(JSON.stringify({ code: CODE })), ctx);
  assertEquals(res.status, 404);
});

Deno.test('non-JSON, oversized, and non-string codes are 404 without a lookup', async () => {
  brooch.status = () => {
    throw new Error('must not be called');
  };
  for (
    const body of [
      'not json',
      JSON.stringify({ code: 12345 }),
      JSON.stringify({ code: CODE + 'X' }),
      JSON.stringify({ nope: CODE }),
      JSON.stringify({ code: 'A'.repeat(100_000) }),
    ]
  ) {
    const res = await handler.POST!(post(body), ctx);
    assertEquals(res.status, 404, body.slice(0, 30));
  }
});

Deno.test('a database failure is 503, not a crash', async () => {
  brooch.status = () => Promise.reject(new Error('db down'));
  const res = await handler.POST!(post(JSON.stringify({ code: CODE })), ctx);
  assertEquals(res.status, 503);
});

Deno.test('Content-Length > MAX_BODY is 404 without a lookup', async () => {
  brooch.status = () => {
    throw new Error('must not be called');
  };
  const res = await handler.POST!(
    post(JSON.stringify({ code: CODE }), 'application/json', {
      'content-length': '999999',
    }),
    ctx,
  );
  assertEquals(res.status, 404);
});

Deno.test('streamed body > MAX_BODY without Content-Length is 404 without a lookup', async () => {
  brooch.status = () => {
    throw new Error('must not be called');
  };
  const res = await handler.POST!(postStreamed(65536), ctx);
  assertEquals(res.status, 404);
});

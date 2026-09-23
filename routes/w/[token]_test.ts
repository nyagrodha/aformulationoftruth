/**
 * /w/:token — hermetic: lib/wearable's lookup is stubbed through its seam,
 * and ctx is a minimal stand-in for Fresh's (see routes/e/[code]_test.ts).
 */
import { assertEquals } from '$std/assert/mod.ts';
import { dbForTesting as wearableDb } from '../../lib/wearable.ts';
import { handler } from './[token].tsx';

const TOKEN = 'tok_0123456789abcdef';

function ctx(token: string) {
  return {
    params: { token },
    render: (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 })),
    renderNotFound: () => Promise.resolve(new Response('not found', { status: 404 })),
  } as never;
}

function stubWearable(found: boolean) {
  // deno-lint-ignore no-explicit-any
  wearableDb.withConnection = (<T>(h: (c: any) => Promise<T>) =>
    h({
      queryObject: () => Promise.resolve({ rows: found ? [{ display_name: null, share_owner_responses: false }] : [] }),
    })) as never;
}

Deno.test('a malformed token is a 404 without touching the database', async () => {
  wearableDb.withConnection = () => {
    throw new Error('must not be called');
  };
  const res = await handler.GET!(new Request('http://localhost/w/short'), ctx('short'));
  assertEquals(res.status, 404);
});

Deno.test('an unknown token is a 404', async () => {
  stubWearable(false);
  const res = await handler.GET!(new Request(`http://localhost/w/${TOKEN}`), ctx(TOKEN));
  assertEquals(res.status, 404);
});

Deno.test('a known token renders the invitation and plants the wearable cookie', async () => {
  stubWearable(true);
  const res = await handler.GET!(new Request(`http://localhost/w/${TOKEN}`), ctx(TOKEN));
  assertEquals(res.status, 200);
  const cookies = res.headers.getSetCookie();
  assertEquals(cookies.length, 1);
  assertEquals(cookies[0].startsWith(`wearable_token=${TOKEN};`), true);
});

Deno.test('Accept-Language: fr gets data with greeting Bonjour', async () => {
  stubWearable(true);
  const req = new Request(`http://localhost/w/${TOKEN}`, { headers: { 'Accept-Language': 'fr' } });
  const res = await handler.GET!(req, ctx(TOKEN));
  const data = await res.json();
  assertEquals(data.greeting, 'Bonjour');
});

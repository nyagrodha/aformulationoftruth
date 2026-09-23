/**
 * /e/:code — hermetic: lib/brooch's accept and lib/wearable's lookup are
 * stubbed through their seams, and ctx is a minimal stand-in for Fresh's.
 */
import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { dbForTesting as wearableDb } from '../../lib/wearable.ts';
import { brooch, handler } from './[code].tsx';

const CODE = 'AAAAAQAAAAFx9TXanbdHdONdZuM';
const HASH = 'b'.repeat(64);

function ctx(code: string) {
  return {
    params: { code },
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

Deno.test('a malformed code is a 404 without touching the database', async () => {
  brooch.accept = () => {
    throw new Error('must not be called');
  };
  const res = await handler.GET!(new Request('http://localhost/e/x'), ctx('short'));
  assertEquals(res.status, 404);
});

Deno.test('a refused code is the uniform 404', async () => {
  brooch.accept = () => Promise.resolve(null);
  stubWearable(true);
  const res = await handler.GET!(new Request(`http://localhost/e/${CODE}`), ctx(CODE));
  assertEquals(res.status, 404);
});

Deno.test('an accepted code renders the invitation and plants both cookies', async () => {
  brooch.accept = () => Promise.resolve({ wearableToken: 'tok_0123456789abcdef', codeHash: HASH });
  stubWearable(true);
  const res = await handler.GET!(new Request(`http://localhost/e/${CODE}`), ctx(CODE));
  assertEquals(res.status, 200);
  const cookies = res.headers.getSetCookie();
  assertEquals(cookies.length, 2);
  assertStringIncludes(cookies[0], 'wearable_token=tok_0123456789abcdef;');
  assertStringIncludes(cookies[1], `encounter=${HASH};`);
});

/**
 * Newsletter HTTP gates that must fail before the database is touched.
 *
 *   deno test --allow-env --allow-read routes/api/newsletter/subscribe_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { handler as subscribe } from './subscribe.ts';
import { handler as confirm } from './confirm.ts';
import { handler as unsubscribe } from './unsubscribe.ts';

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

Deno.test('subscribe - invalid JSON is 400', async () => {
  const res = await subscribe.POST!(jsonPost('not json{'), {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Invalid JSON body');
});

Deno.test('subscribe - missing email is 400', async () => {
  const res = await subscribe.POST!(jsonPost({}), {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Email required');
});

Deno.test('subscribe - a malformed address never reaches storage', async () => {
  const res = await subscribe.POST!(jsonPost({ email: 'not-an-email' }), {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Please use a valid email address');
});

Deno.test('subscribe - a suspicious Gmail local-part is rejected', async () => {
  const res = await subscribe.POST!(jsonPost({ email: 'a.b.c.d.e@gmail.com' }), {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Please use a valid email address');
});

Deno.test('confirm - missing token is 400, not an enumeration oracle', async () => {
  const req = new Request('http://localhost/api/newsletter/confirm', {
    headers: { Accept: 'application/json' },
  });
  const res = await confirm.GET!(req, {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Missing confirmation token');
});

Deno.test('unsubscribe - missing token is 400', async () => {
  const req = new Request('http://localhost/api/newsletter/unsubscribe', {
    headers: { Accept: 'application/json' },
  });
  const res = await unsubscribe.GET!(req, {} as never);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Missing unsubscribe token');
});

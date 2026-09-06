/**
 * Profile save: the owner comes from the session cookie, never the body,
 * and a handle must not shadow a real route.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/profile_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { handler, profileHandleError } from './profile.ts';

const POST = handler.POST!;

async function post(body: unknown, cookie?: string): Promise<Response> {
  return await POST(
    new Request('http://localhost/api/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    // deno-lint-ignore no-explicit-any
    {} as any,
  );
}

Deno.test('profile: a missing jwt cookie is 401 before the body is read', async () => {
  const prev = Deno.env.get('JWT_SECRET');
  Deno.env.delete('JWT_SECRET');
  try {
    const res = await post({ visibility: 'public', handle: 'anyone' });
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, 'Not authenticated');
  } finally {
    if (prev === undefined) Deno.env.delete('JWT_SECRET');
    else Deno.env.set('JWT_SECRET', prev);
  }
});

Deno.test('profile: a garbage jwt is 401, not a cookie mint', async () => {
  const prev = Deno.env.get('JWT_SECRET');
  Deno.env.set('JWT_SECRET', 'test-jwt-secret-for-profile-coverage');
  try {
    const res = await post({ visibility: 'private' }, 'jwt=not-a-token');
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, 'Not authenticated');
    assertEquals(res.headers.get('set-cookie'), null);
  } finally {
    if (prev === undefined) Deno.env.delete('JWT_SECRET');
    else Deno.env.set('JWT_SECRET', prev);
  }
});

Deno.test('profileHandleError: a public profile without a handle is unroutable', () => {
  assertEquals(profileHandleError(null, 'public'), 'A public profile needs a handle.');
  assertEquals(profileHandleError('', 'public'), 'A public profile needs a handle.');
  assertEquals(profileHandleError(null, 'private'), null);
});

Deno.test('profileHandleError: reserved handles that would shadow a route', () => {
  for (const handle of ['api', 'admin', 'about', 'login', 'auth', 'p', 'css', 'js']) {
    assertEquals(
      profileHandleError(handle, 'public'),
      'That handle is not available.',
      handle,
    );
  }
});

Deno.test('profileHandleError: traversal, punctuation, and length', () => {
  for (const handle of ['../admin', 'foo/bar', '-leading', 'trailing-', 'a'.repeat(65), 'has space']) {
    assertEquals(
      profileHandleError(handle, 'private'),
      'That handle is not available.',
      handle,
    );
  }
  // One alphanumeric character is enough: the first class is the whole handle.
  assertEquals(profileHandleError('x', 'public'), null);
  assertEquals(profileHandleError('ok-handle', 'public'), null);
  assertEquals(profileHandleError('ab', 'public'), null);
  assertEquals(profileHandleError('a'.repeat(64), 'public'), null);
});

Deno.test('the owner is the session email hash, never a body field', async () => {
  const src = await Deno.readTextFile(new URL('./profile.ts', import.meta.url));
  assert(
    src.includes('const emailHash = session.emailHash'),
    'the INSERT must be keyed by the session, not the request',
  );
  assert(
    !/parsed\.data\.[A-Za-z]*email/i.test(src),
    'the body must not be allowed to name the owner',
  );
  assert(
    !src.includes('body.emailHash') && !src.includes('body.email'),
    'a raw body field must not become the owner',
  );
});

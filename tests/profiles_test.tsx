/*
 * Profiles: the parts that can be checked without a database.
 *
 * Covers the three bugs that left /people empty -- finished respondents
 * bounced, a save button that could not run, no way to edit -- and the private
 * link that replaces handle access for private profiles.
 */

import { assert, assertEquals, assertMatch, assertNotEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { FreshContext, PageProps } from '$fresh/server.ts';
import ProfileCreatePage, { handler as createHandler, type ProfileCreateData } from '../routes/profile-create.tsx';
import { handler as choiceHandler } from '../routes/profile-choice.tsx';
import ProfilePage, { handler as profileHandler } from '../routes/p/[handle].tsx';
import { handler as apiHandler } from '../routes/api/profile.ts';
import { newPrivateSlug, PRIVATE_SLUG_RE, validateProfile } from '../lib/profiles.ts';
import { expectedSchema, readMigrationFiles } from '../lib/schema-expectations.ts';

// deno-lint-ignore no-explicit-any
type AnyHandler = any;

const ctx = (params: Record<string, string> = {}) =>
  ({
    params,
    render: () => new Response('rendered'),
    renderNotFound: () => new Response('not found', { status: 404 }),
  }) as unknown as FreshContext;

const page = (data: ProfileCreateData) => render(<ProfileCreatePage {...({ data } as PageProps<ProfileCreateData>)} />);

const owner = (over: Partial<Extract<ProfileCreateData, { state: 'owner' }>> = {}): ProfileCreateData => ({
  state: 'owner',
  values: { handle: null, displayName: null, bio: null, visibility: 'private' },
  exists: false,
  privatePath: null,
  ...over,
});

// --- validation -------------------------------------------------------------

Deno.test('validateProfile - a public profile needs a handle', () => {
  assertEquals(
    validateProfile({ handle: '  ', displayName: null, bio: null, visibility: 'public' }),
    'handle_required',
  );
});

Deno.test('validateProfile - handles are lowercased, checked, and reserved names refused', () => {
  const ok = validateProfile({ handle: ' Weather-Report ', displayName: '', bio: null, visibility: 'public' });
  assertEquals(ok, { handle: 'weather-report', displayName: null, bio: null, visibility: 'public' });
  for (const bad of ['-x', 'x-', 'a b', 'people', 'api', 'x'.repeat(65)]) {
    assertEquals(
      validateProfile({ handle: bad, displayName: null, bio: null, visibility: 'private' }),
      'handle_invalid',
      bad,
    );
  }
});

Deno.test('validateProfile - overlong name or statement is refused', () => {
  assertEquals(
    validateProfile({ handle: null, displayName: 'x'.repeat(121), bio: null, visibility: 'private' }),
    'too_long',
  );
});

// --- private slug -----------------------------------------------------------

Deno.test('private slugs are 32 hex chars and random', () => {
  const a = newPrivateSlug();
  assertMatch(a, PRIVATE_SLUG_RE);
  assertNotEquals(a, newPrivateSlug());
});

Deno.test('migration 020 adds private_slug to fresh_profiles', async () => {
  const e = expectedSchema(await readMigrationFiles());
  assert(e.columns.get('fresh_profiles')?.has('private_slug'));
});

// --- access: no cookies means no database lookup, so these run anywhere -----

Deno.test('profile pages send a guest to the gate', async () => {
  const get = new Request('https://example.test/profile-create');
  for (const h of [createHandler as AnyHandler, choiceHandler as AnyHandler]) {
    const res: Response = await h.GET(get, ctx());
    assertEquals(res.status, 303);
    assertEquals(res.headers.get('location'), '/');
  }
  const post = new Request('https://example.test/profile-create', { method: 'POST', body: new FormData() });
  const res: Response = await (createHandler as AnyHandler).POST(post, ctx());
  assertEquals(res.status, 303);
});

Deno.test('the profile API refuses a cross-site post before reading any session', async () => {
  const req = new Request('https://example.test/api/profile', {
    method: 'POST',
    headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete' }),
  });
  const res: Response = await (apiHandler as AnyHandler).POST(req, ctx());
  assertEquals(res.status, 403);
});

Deno.test('a malformed private link is a 404 without a lookup', async () => {
  for (const handle of ['~', '~nothex', '~' + 'A'.repeat(32)]) {
    const res: Response = await (profileHandler as AnyHandler).GET(
      new Request('https://example.test/'),
      ctx({ handle }),
    );
    assertEquals(res.status, 404, handle);
  }
});

// --- the form ---------------------------------------------------------------

Deno.test('the profile form posts without JavaScript and carries no inline script', () => {
  const html = page(owner());
  assertStringIncludes(html, 'method="post"');
  assertStringIncludes(html, 'action="/profile-create"');
  assertStringIncludes(html, 'type="submit"');
  assertEquals(html.includes('<script'), false);
  assertEquals(html.includes('&amp;&amp;'), false);
});

Deno.test('the form is prefilled from a stored profile and offers link and delete', () => {
  const html = page(owner({
    values: { handle: 'weather-report', displayName: 'Weather', bio: 'A note', visibility: 'public' },
    exists: true,
    privatePath: '/p/~' + '0'.repeat(32),
  }));
  assertStringIncludes(html, 'value="weather-report"');
  assertStringIncludes(html, 'value="Weather"');
  assertStringIncludes(html, 'A note</textarea>');
  assertMatch(html, /id="public"[^>]*checked/);
  assertStringIncludes(html, 'href="/p/~' + '0'.repeat(32) + '"');
  assertStringIncludes(html, 'value="new-link"');
  assertStringIncludes(html, 'value="delete"');
});

Deno.test('a new profile is offered neither a link nor delete', () => {
  const html = page(owner());
  assertEquals(html.includes('value="delete"'), false);
  assertEquals(html.includes('value="new-link"'), false);
});

Deno.test('errors and confirmations are shown', () => {
  assertStringIncludes(page(owner({ error: 'That handle is already taken.' })), 'That handle is already taken.');
  assertStringIncludes(page(owner({ done: 'saved' })), 'Saved.');
});

Deno.test('an unproven session is told to open its link, with no form', () => {
  const html = page({ state: 'unproven' });
  assertStringIncludes(html, 'Open the link we emailed you');
  assertEquals(html.includes('<form'), false);
});

// --- the profile page -------------------------------------------------------

Deno.test('a profile reached by private link is marked noindex', () => {
  const data = { handle: null, displayName: 'Quiet', bio: 'Hello', viaPrivateLink: true };
  const html = render(<ProfilePage {...({ data } as PageProps<typeof data>)} />);
  assertStringIncludes(html, 'Quiet');
  assertStringIncludes(html, 'shared privately');
});

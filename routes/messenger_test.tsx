import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import { handler as messenger } from './messenger.tsx';
import { handler as messages } from './messages.tsx';
import { handler as alias } from './encrypted-messenger.tsx';
import { handler as identity } from './api/messenger/identity.ts';
import { handler as send } from './api/messenger/send.ts';
import { handler as threads } from './api/messenger/threads.ts';
import PeoplePage from './people.tsx';
import ProfilePage from './p/[handle].tsx';

Deno.test('retired messenger pages redirect to the directory without caching', () => {
  for (const handler of [messenger, messages, alias]) {
    const response = handler();
    assertEquals(response.status, 303);
    assertEquals(response.headers.get('location'), '/people');
    assertEquals(response.headers.get('cache-control'), 'no-store');
  }
});

Deno.test('all messenger APIs are unavailable without reading stored data', async () => {
  for (const handler of [identity, send, threads]) {
    const response = handler();
    assertEquals(response.status, 410);
    assertEquals(await response.json(), { error: 'messaging_unavailable' });
  }
});

Deno.test('directory links to profiles without offering messaging', () => {
  const data = { people: [{ handle: 'example', displayName: 'Example', bio: 'Hello' }] };
  const html = render(<PeoplePage {...({ data } as PageProps<typeof data>)} />);
  assertStringIncludes(html, 'href="/p/example"');
  assertStringIncludes(html, 'view profile');
  assertEquals(html.includes('message'), false);
});

Deno.test('profiles show their nameplate without a compose form or messenger script', () => {
  const data = { handle: 'example', displayName: 'Example', bio: 'Hello' };
  const html = render(<ProfilePage {...({ data } as PageProps<typeof data>)} />);
  assertStringIncludes(html, 'Hello');
  assertStringIncludes(html, 'href="/people"');
  for (const removed of ['compose', 'textarea', '/messages', '/js/']) {
    assertEquals(html.includes(removed), false);
  }
});

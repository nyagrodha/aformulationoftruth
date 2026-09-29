import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import PeoplePage from '../routes/people.tsx';

const page = () => render(<PeoplePage {...({ data: { people: [] } } as unknown as PageProps<{ people: [] }>)} />);

Deno.test('people - carries the site nav, with people current', () => {
  const html = page();
  assertStringIncludes(html, 'class="site-nav"');
  assertStringIncludes(html, 'href="/people" aria-current="page"');
});

Deno.test('people - the home pill is gone; the wordmark goes home', () => {
  assertEquals(page().includes('← home'), false);
});

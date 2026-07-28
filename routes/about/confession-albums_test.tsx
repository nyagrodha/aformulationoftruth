import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ConfessionAlbumsPage from './confession-albums.tsx';

Deno.test('page states plainly that Proust did not invent the form', () => {
  const html = render(<ConfessionAlbumsPage />);
  assertStringIncludes(html, 'did not invent');
});

Deno.test('page covers the album amicorum lineage', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'album amicorum');
});

Deno.test('page links back to about', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'href="/about"');
});

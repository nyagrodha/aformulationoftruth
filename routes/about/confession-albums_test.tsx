import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ConfessionAlbumsPage from './confession-albums.tsx';

Deno.test('page states plainly that Proust did not invent the form', () => {
  const html = render(<ConfessionAlbumsPage />);
  assertStringIncludes(html, 'come up with the querstions');
  assertStringIncludes(html, 'The questions have no author on record');
});

Deno.test('page covers the album amicorum lineage', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'album amicorum');
});

Deno.test('page carries the corrected record, not the folklore', () => {
  const html = render(<ConfessionAlbumsPage />);
  assertStringIncludes(html, 'André Berge');
  assertStringIncludes(html, 'An Album to Record Thoughts, Feelings, &amp;c.');
});

Deno.test('page links back to about', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'href="/about"');
});

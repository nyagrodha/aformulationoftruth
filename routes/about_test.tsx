import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import AboutPage from './about.tsx';

Deno.test('about page preserves its original copy', () => {
  const html = render(<AboutPage />);
  assertStringIncludes(html, 'You are not one self');
  assertStringIncludes(html, 'Find who sleeps');
  assertStringIncludes(html, 'vividh');
});

Deno.test('about page links to both new essay pages', () => {
  const html = render(<AboutPage />);
  assertStringIncludes(html, '/about/confession-albums');
  assertStringIncludes(html, '/about/respondents');
});

Deno.test('about page links to the shop', () => {
  assertStringIncludes(render(<AboutPage />), '/shop');
});

Deno.test('the static about.html is gone', async () => {
  let existed = true;
  try {
    await Deno.stat('./public/about.html');
  } catch {
    existed = false;
  }
  assertEquals(existed, false);
});

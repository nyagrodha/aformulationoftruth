/**
 * The landing page's illuminated initials: the E that opens the Proust quote and
 * the Y that opens the incipit. Each is a picture standing in for a letter, so
 * each must keep the letter for everyone who does not see the picture.
 */
import { assert, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import Home from '../routes/index.tsx';

const captcha = { token: 't', question: 'q' };
const html = render(<Home {...({ data: { captcha } } as unknown as PageProps<never>)} />);

Deno.test('the quote opens with the illuminated E, and still reads "Every"', () => {
  const title = html.slice(
    html.indexOf('class="hero-title"'),
    html.indexOf('</p>', html.indexOf('class="hero-title"')),
  );
  assertStringIncludes(title, 'src="/images/e-illuminated-640.webp"');
  // The picture is hidden from assistive technology; the letter is not.
  assert(
    /<img[^>]*e-illuminated-640\.webp[^>]*aria-hidden="true"/.test(title) ||
      /aria-hidden="true"[^>]*e-illuminated/.test(title),
  );
  assertStringIncludes(title, '<span class="sr-only">E</span>very reader');
  assertStringIncludes(title, 'width="640"');
  assertStringIncludes(title, 'height="640"');
});

Deno.test('the incipit keeps its illuminated Y', () => {
  assertStringIncludes(html, 'src="/images/y-illuminated-560.webp"');
  assertStringIncludes(html, '<span class="sr-only">Y</span>our answers');
});

Deno.test('the E ships as a light WebP, not the 3 MB source', async () => {
  const { size } = await Deno.stat('public/images/e-illuminated-640.webp');
  assert(size < 250_000, `${size} bytes`);
});

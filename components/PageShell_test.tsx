import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { Ornament, PageShell } from './PageShell.tsx';

Deno.test('PageShell renders a full document on the landing page stylesheet', () => {
  const html = render(
    <PageShell title='Test Title' description='Test description'>
      <p>body content</p>
    </PageShell>,
  );
  assertStringIncludes(html, '<title>Test Title</title>');
  assertStringIncludes(html, 'Test description');
  assertStringIncludes(html, '/css/prolegomenon.css');
  assertStringIncludes(html, 'body content');
});

Deno.test('PageShell no longer loads the madras stylesheet', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertEquals(html.includes('madras-theme.css'), false);
});

Deno.test('PageShell wraps content in .movement for the prose measure', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <p>x</p>
    </PageShell>,
  );
  assertStringIncludes(html, 'class="movement"');
  assertStringIncludes(html, 'class="site-header"');
});

Deno.test('PageShell footer links to about, contact and privacy', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertStringIncludes(html, 'href="/about"');
  assertStringIncludes(html, 'href="/contact.html"');
  assertStringIncludes(html, 'href="/privacy.html"');
});

Deno.test('Ornament renders an aria-hidden section-break divider', () => {
  const html = render(<Ornament />);
  assertStringIncludes(html, 'aria-hidden="true"');
  assertStringIncludes(html, 'class="section-break"');
});

Deno.test('PageShell does not render the retired theme selector', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertEquals(html.includes('theme-btn'), false);
  assertEquals(html.includes('theme-toggle.js'), false);
});

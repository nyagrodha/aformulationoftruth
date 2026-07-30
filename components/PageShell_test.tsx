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

/*
 * The shop was reachable only from /about and /shop for a while: the landing
 * page and this shell had drifted onto separate headers and only one of them
 * ever carried the link.
 */
Deno.test('PageShell nav reaches the gift shop', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertStringIncludes(html, 'href="/shop"');
  assertStringIncludes(html, 'Gift Shop');
});

Deno.test('PageShell keeps the menu usable without JS', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertStringIncludes(html, '<noscript>');
  assertStringIncludes(html, '.nav-list[hidden]{display:flex}');
  /* The revealed list must not sit beside a toggle still claiming to be collapsed. */
  assertEquals(html.includes('aria-expanded'), false);
  assertEquals(html.includes('<button'), false);
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

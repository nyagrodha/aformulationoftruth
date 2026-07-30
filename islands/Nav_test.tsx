import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import Nav from './Nav.tsx';

const ITEMS = [
  { label: 'Gate', href: '#begin' },
  { label: 'Gift Shop', href: '/shop' },
];

Deno.test('Nav renders every item it is given', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'href="#begin"');
  assertStringIncludes(html, 'Gate');
  assertStringIncludes(html, 'href="/shop"');
  assertStringIncludes(html, 'Gift Shop');
});

Deno.test('Nav ships the full wordmark, Tamil and Devanagari both', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'முல');
  assertStringIncludes(html, 'सत्य');
  assertStringIncludes(html, 'sya');
  assertStringIncludes(html, 'a formulation of truth');
});

/*
 * The wordmark segments carry their own classes so the stylesheet can colour
 * them; unclassed glyphs would silently render as flat ink.
 */
Deno.test('Nav marks up each wordmark segment for colouring', () => {
  const html = render(<Nav items={ITEMS} />);
  for (const cls of ['wm-a', 'wm-num', 'wm-ta', 'wm-sa']) {
    assertStringIncludes(html, `class="${cls}"`);
  }
});

/*
 * Server render is the closed state, and the toggle is a plain button — a
 * submit button here would post any form it ever ends up inside.
 */
Deno.test('Nav renders closed, with a typed toggle wired to the list', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'type="button"');
  assertStringIncludes(html, 'aria-expanded="false"');
  assertStringIncludes(html, 'aria-controls="nav-list"');
  assertStringIncludes(html, 'id="nav-list"');
  assertStringIncludes(html, 'hidden');
});

Deno.test('Nav renders no items when given none', () => {
  const html = render(<Nav items={[]} />);
  assertEquals(html.includes('<li'), false);
});

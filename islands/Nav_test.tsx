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
 * The server render carries no disclosure semantics at all. Without JS the
 * <noscript> rule opens the list, and a toggle still announcing
 * aria-expanded="false" beside an open list would be a plain lie; the element
 * only becomes a button once hydration can honour it.
 */
Deno.test('Nav server-renders an inert wordmark, not a collapsed toggle', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'class="nav-toggle"');
  assertStringIncludes(html, 'id="nav-list"');
  assertStringIncludes(html, 'hidden');
  assertEquals(html.includes('<button'), false);
  assertEquals(html.includes('aria-expanded'), false);
  assertEquals(html.includes('aria-controls'), false);
});

Deno.test('Nav renders no items when given none', () => {
  const html = render(<Nav items={[]} />);
  assertEquals(html.includes('<li'), false);
});

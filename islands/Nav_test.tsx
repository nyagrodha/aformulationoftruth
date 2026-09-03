import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import Nav from './Nav.tsx';
import { PAGE_NAV } from '../components/nav-shared.ts';

const ITEMS = [
  { label: 'begin', href: '#begin' },
  { label: 'gift shop', href: '/shop' },
];

Deno.test('Nav renders every item it is given', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'href="#begin"');
  assertStringIncludes(html, 'begin');
  assertStringIncludes(html, 'href="/shop"');
  assertStringIncludes(html, 'gift shop');
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
 * The wordmark is a link home, not the control. Its glyphs spell a4முலसत्यsya
 * across three scripts, so they are hidden from assistive technology and the
 * link carries a name of its own — without that it would announce as the raw
 * glyph soup.
 */
Deno.test('Nav gives the wordmark link an accessible name and hides the glyphs', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'class="wordmark wordmark-home"');
  assertStringIncludes(html, 'href="/"');
  assertStringIncludes(html, 'aria-label="Home"');
  assertStringIncludes(html, 'aria-hidden="true"');
});

/*
 * The server render carries no disclosure semantics at all. Without JS the
 * <noscript> rule opens the list, and a toggle still announcing
 * aria-expanded="false" beside an open list would be a plain lie; the element
 * only becomes a button once hydration can honour it.
 */
Deno.test('Nav server-renders an inert toggle, not a collapsed one', () => {
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

/*
 * The mark is the toggle's whole visible content, and the image is empty-alt
 * ornament, so the label on the control is the only accessible name in play. A
 * non-empty alt here would announce the glyph a second time.
 */
Deno.test('Nav renders the irendu mark inside the toggle', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'class="nav-mark"');
  assertStringIncludes(html, 'src="/images/nav-irendu-372.webp"');

  /*
   * The renderer minimises alt="" to a bare `alt`, which is the same empty
   * value; asserting the quoted form would fail on correct markup. What must be
   * true is that the attribute is there and carries nothing -- a missing alt
   * makes assistive technology fall back to announcing the filename, and a
   * non-empty one duplicates the button's label. `alt="` can only appear if
   * someone gave it text.
   */
  const img = html.slice(html.indexOf('<img'), html.indexOf('/>') + 2);
  assertStringIncludes(img, ' alt');
  assertEquals(img.includes('alt="'), false);
});

/*
 * Intrinsic dimensions are what let the header reserve the mark's box before
 * the image arrives; without them the wordmark beside it jumps on load. They
 * must also be the file's real size, or the reserved box is the wrong shape and
 * the jump comes back in a subtler form — so assert the numbers, not merely
 * that the attributes are present.
 */
Deno.test('Nav declares the mark intrinsic size so the header reserves its box', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, 'width="372"');
  assertStringIncludes(html, 'height="252"');
});

/*
 * The five-line mark is gone, and with it the --mark-* tokens and the <mask>
 * that cut the ௨ out of the bars. A half-migration that left the SVG rendering
 * underneath the image would look correct and ship both.
 */
Deno.test('Nav ships no trace of the retired five-line mark', () => {
  const html = render(<Nav items={ITEMS} />);
  assertEquals(html.includes('five-line-mark'), false);
  assertEquals(html.includes('mark-bar'), false);
  assertEquals(html.includes('<mask'), false);
});

/*
 * The retired LogoMenu linked to a /lotto.html that never existed, on three
 * routes. PAGE_NAV is the single list those routes now share; this fails if it
 * comes back.
 */
Deno.test('PAGE_NAV points at nothing that does not exist', () => {
  const hrefs = PAGE_NAV.map((i) => i.href);
  assertEquals(hrefs.includes('/lotto.html'), false);
  /* Bare fragments resolve only on the landing document. */
  assertEquals(hrefs.some((h) => h.startsWith('#')), false);
  assertEquals(hrefs, ['/#begin', '/about', '/people', '/messages', '/shop']);
});

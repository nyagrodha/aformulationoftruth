import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import Nav from './Nav.tsx';
import { LANDING_NAV, NAV_NOSCRIPT_CSS, PAGE_NAV } from '../components/nav-shared.ts';

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
  assertStringIncludes(html, 'id="nav-rays"');
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
 * The retired LogoMenu linked to a /lotto.html that never existed. Every href
 * in PAGE_NAV must be a route file; the pipeline items have none by design.
 */
Deno.test('PAGE_NAV points at nothing that does not exist', async () => {
  assertEquals(PAGE_NAV.map((i) => i.label), [
    'begin',
    'about',
    'people',
    'gift shop',
    'heard on the mesh',
    'messenger',
    'lotto',
  ]);
  for (const { href, pipeline } of PAGE_NAV) {
    if (pipeline) {
      assertEquals(href, undefined);
      continue;
    }
    /* Bare fragments resolve only on the landing document. */
    assertEquals(href!.startsWith('#'), false, href);
    const path = new URL(href!, 'http://x').pathname;
    const file = path === '/' ? 'routes/index.tsx' : `routes${path}.tsx`;
    await Deno.stat(file); // throws if the route is missing
  }
});

Deno.test('LANDING_NAV matches PAGE_NAV but for its in-page begin and about', () => {
  assertEquals(
    LANDING_NAV.map((i) => [i.label, i.pipeline ?? false]),
    PAGE_NAV.map((i) => [i.label, i.pipeline ?? false]),
  );
  assertEquals(LANDING_NAV[0].href, '#begin');
  assertEquals(LANDING_NAV[1].href, '#about');
  assertEquals(LANDING_NAV.slice(2), PAGE_NAV.slice(2));
});

Deno.test('Nav renders the seven as a fan, one per ray, in order', () => {
  const html = render(<Nav items={PAGE_NAV} />);
  assertStringIncludes(html, 'class="nav-rays"');
  assertStringIncludes(html, 'src="/images/nav-rays-light.webp"');
  assertStringIncludes(html, 'src="/images/nav-rays-dark.webp"');
  const order = PAGE_NAV.map((i) => html.indexOf(`>${i.label}`));
  assertEquals([...order].sort((a, b) => a - b), order);
  assertEquals(order.includes(-1), false);
  assertEquals((html.match(/class="nav-ray nav-ray--/g) ?? []).length, 7);
});

Deno.test('pipeline items are not focusable', () => {
  const html = render(<Nav items={PAGE_NAV} />);
  assertStringIncludes(html, 'messenger · in the pipeline');
  assertStringIncludes(html, 'lotto · in the pipeline');
  const links = html.match(/<a [^>]*>/g) ?? [];
  /* Five destinations plus the wordmark link home. */
  assertEquals(links.length, 6);
  assertEquals(html.includes('tabindex'), false);
});

Deno.test('Nav marks exactly the current page, on the server', () => {
  const html = render(<Nav items={PAGE_NAV} current='/about' />);
  assertEquals((html.match(/aria-current="page"/g) ?? []).length, 1);
  assertStringIncludes(html, 'href="/about" aria-current="page"');
  assertEquals(render(<Nav items={PAGE_NAV} />).includes('aria-current'), false);
});

Deno.test('fragments are never current', () => {
  const html = render(<Nav items={LANDING_NAV} current='/' />);
  assertEquals(html.includes('aria-current'), false);
});

Deno.test('items beyond the rays still render', () => {
  const eight = [...PAGE_NAV.slice(0, 5), { label: 'a', href: '/a' }, { label: 'b', href: '/b' }, {
    label: 'c',
    href: '/c',
  }];
  const html = render(<Nav items={eight} />);
  assertStringIncludes(html, 'href="/c"');
  assertStringIncludes(html, 'class="nav-ray nav-ray--below"');
});

Deno.test('Nav ships no trace of the retired bar', () => {
  const html = render(<Nav items={PAGE_NAV} />);
  assertEquals(html.includes('nav-list'), false);
});

Deno.test('without script the fan is open and the mark already small', () => {
  assertStringIncludes(NAV_NOSCRIPT_CSS, '.nav-rays[hidden]{display:block}');
  assertStringIncludes(NAV_NOSCRIPT_CSS, '.nav-mark{width:74px}');
  assertEquals(NAV_NOSCRIPT_CSS.includes('nav-list'), false);
});

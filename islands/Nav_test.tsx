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
 * The mark is the toggle's whole visible content, and the SVG is aria-hidden
 * ornament, so the label on the control is the only accessible name in play.
 */
Deno.test('Nav renders the five-line mark inside the toggle', () => {
  const html = render(<Nav items={ITEMS} />);
  /* No caller class here, so the trailing space is trimmed off. */
  assertStringIncludes(html, 'class="five-line-mark"');
  assertStringIncludes(html, 'viewBox="0 0 300 260"');
  for (let n = 1; n <= 5; n++) {
    assertStringIncludes(html, `mark-bar mark-bar-${n}`);
    assertStringIncludes(html, `var(--mark-${n})`);
  }
});

/*
 * A <mask> that nothing points at is inert: the SVG would still contain the ௨
 * outline while rendering five unbroken bars, and a test that only asserted the
 * mask existed would pass on a mark with no glyph in it at all. Assert the
 * reference, and that it is bars 2-4 carrying it — masking all five would cut
 * the outer bars too and read as a hole rather than negative space.
 */
Deno.test('Nav mask is referenced by the middle bars, not merely present', () => {
  const html = render(<Nav items={ITEMS} />);
  assertStringIncludes(html, '<mask id="five-line-mark-tamil-two"');
  assertStringIncludes(html, 'mask="url(#five-line-mark-tamil-two)"');

  /* The masked group must wrap bars 2-4 and neither bar 1 nor bar 5. */
  const group = html.slice(html.indexOf('mask="url(#five-line-mark-tamil-two)"'));
  const inner = group.slice(0, group.indexOf('</g>'));
  assertEquals(inner.includes('mark-bar-1'), false);
  assertEquals(inner.includes('mark-bar-5'), false);
  for (const n of [2, 3, 4]) assertStringIncludes(inner, `mark-bar-${n}`);
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
  assertEquals(hrefs, ['/#begin', '/about', '/shop']);
});

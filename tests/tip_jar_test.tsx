/**
 * The tip jar: its contents, its safety, and that it is everywhere it should be.
 *
 * Payment details may be added independently. When all of them are configured,
 * add a completion assertion alongside that checked-in configuration.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertMatch, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import TipJar from '../components/TipJar.tsx';
import { STRIPE_TIP_LINK, TIP_ADDRESSES } from '../data/tip-jar.ts';
import { extractTipJar, renderTipJar, STATIC_PAGES } from '../scripts/sync-tip-jar.tsx';

/* Shape only — enough to catch a truncated paste or the wrong coin in a slot. */
const SHAPES: Record<string, RegExp> = {
  BTC: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  ETH: /^0x[0-9a-fA-F]{40}$/,
  XMR: /^[48][1-9A-HJ-NP-Za-km-z]{94}$/,
  ZEC: /^(u1[02-9ac-hj-np-z]{100,}|zs1[02-9ac-hj-np-z]{75}|t1[1-9A-HJ-NP-Za-km-z]{33})$/,
};

/* Every page with a footer. Each must render the jar, directly or via SiteFooter. */
const FOOTER_FILES = [
  'components/PageShell.tsx',
  'components/SiteFooter.tsx',
  'routes/index.tsx',
  'routes/check-email.tsx',
  'routes/gate.tsx',
  'routes/login.tsx',
  'routes/profile-choice.tsx',
  'routes/profile-create.tsx',
  'routes/questionnaire.tsx',
];

Deno.test('tip jar - each address has the shape of its coin', () => {
  for (const { symbol, address } of TIP_ADDRESSES) {
    if (address) assertMatch(address, SHAPES[symbol], symbol);
  }
});

Deno.test('tip jar - the card option is a Stripe Payment Link', () => {
  if (STRIPE_TIP_LINK) assertMatch(STRIPE_TIP_LINK, /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/);
});

Deno.test('tip jar - opens without JavaScript', () => {
  const html = render(<TipJar />);
  assertStringIncludes(html, '<details class="tip-jar">');
  assertStringIncludes(html, '<summary>');
  assertEquals(/<script/i.test(html), false);
  assertEquals(/\son[a-z]+=/i.test(html), false, 'no inline event handlers');
});

// Footers lowercase their text. A lowercased Monero or Zcash address is a
// different, invalid string; that rule is the one thing guarding them.
Deno.test('tip jar - addresses are rendered verbatim and protected from case transforms', async () => {
  const html = render(<TipJar />);
  for (const { address } of TIP_ADDRESSES) if (address) assertStringIncludes(html, address);

  const css = await Deno.readTextFile('public/css/tip-jar.css');
  const rule = css.slice(css.indexOf('.tip-jar .tip-jar-address {'));
  assert(rule.length < css.length, 'the address rule is missing');
  assertStringIncludes(rule.slice(0, rule.indexOf('}')), 'text-transform: none');
});

Deno.test('tip jar - the static pages carry the current render', async () => {
  const expected = renderTipJar();
  for (const page of STATIC_PAGES) {
    const actual = extractTipJar(await Deno.readTextFile(page));
    assert(actual !== null, `${page} is missing its tip-jar markers`);
    assertEquals(actual, expected, `${page} is stale — run scripts/sync-tip-jar.tsx`);
  }
});

Deno.test('tip jar - every footer carries it', async () => {
  for (const file of FOOTER_FILES) {
    const source = await Deno.readTextFile(file);
    assert(source.includes('<TipJar') || source.includes('<SiteFooter'), `${file} has no tip jar`);
  }
});

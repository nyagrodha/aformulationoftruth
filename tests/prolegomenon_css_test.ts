/**
 * prolegomenon.css Tests
 *
 * public/css/prolegomenon.css is the new stylesheet backing the rewritten
 * routes/index.tsx landing page and the islands/QuaternarySpheroid.tsx
 * island. There's no CSS execution engine in this test suite, so these are
 * text-level smoke tests that guard against:
 *   - truncated/unbalanced rule blocks
 *   - accidentally deleting a selector still referenced by the markup
 *   - dropping the custom properties, fonts, or media queries the page relies on
 */

import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

const CSS_PATH = new URL('../public/css/prolegomenon.css', import.meta.url);

async function readCss(): Promise<string> {
  return await Deno.readTextFile(CSS_PATH);
}

Deno.test({
  name: 'prolegomenon.css: file exists and is non-empty',
  async fn() {
    const css = await readCss();
    assertEquals(css.length > 0, true);
  },
});

Deno.test({
  name: 'prolegomenon.css: has balanced curly braces (no truncated rule blocks)',
  async fn() {
    const css = await readCss();
    const opens = css.split('{').length - 1;
    const closes = css.split('}').length - 1;
    assertEquals(opens, closes);
  },
});

Deno.test({
  name: 'prolegomenon.css: defines the color custom properties consumed by the page',
  async fn() {
    const css = await readCss();
    const expectedVariables = [
      '--paper',
      '--paper-light',
      '--ink',
      '--muted',
      '--saffron',
      '--cyan',
      '--rose',
      '--indigo',
      '--olive',
      '--ochre',
      '--verdigris',
      '--rule',
    ];

    for (const variable of expectedVariables) {
      assertStringIncludes(css, `${variable}:`, `expected custom property ${variable} to be defined`);
    }
  },
});

Deno.test({
  name: 'prolegomenon.css: declares font-face rules for the two custom typefaces',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, 'font-family: "Noto Serif"');
    assertStringIncludes(css, 'font-family: "League Spartan"');
    assertStringIncludes(css, '/fonts/NotoSerif-Regular.ttf');
    assertStringIncludes(css, '/fonts/LeagueSpartan-VF.woff2');
  },
});

Deno.test({
  name: 'prolegomenon.css: styles every markup class introduced by the rewritten index route',
  async fn() {
    const css = await readCss();
    const selectors = [
      '.site-header',
      '.wordmark',
      '.hero',
      '.hero-copy',
      '.hero-title',
      '.hero-datestamp',
      '.mathematical',
      '.eyebrow',
      '.incipit',
      '.drop-cap',
      '.enter',
      '.geometry',
      '.axis-desire',
      '.axis-habit',
      '.curve',
      '.intersection',
      '.measure-one',
      '.measure-two',
      '.geometry-label',
      '.label-desire',
      '.label-habit',
      '.folio',
      '.sequence',
      '.epigraph',
      '.movement',
      '.prose-paragraph',
      '.movement-copy',
      '.paragraph-break',
      '.question',
      '.answer',
      '.movement-index',
      '.section-break',
      '.begin-questionnaire',
    ];

    for (const selector of selectors) {
      assertStringIncludes(css, selector, `expected selector ${selector} to be defined`);
    }
  },
});

Deno.test({
  name: 'prolegomenon.css: styles the QuaternarySpheroid island markup and its entrance animation',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, '.quaternary-spheroid');
    assertStringIncludes(css, '.quaternary-spheroid canvas');
    assertStringIncludes(css, '.spheroid-sigil');
    assertStringIncludes(css, 'animation: spheroid-enter');
    assertStringIncludes(css, '@keyframes spheroid-enter');
  },
});

Deno.test({
  name: 'prolegomenon.css: disables animation under prefers-reduced-motion, matching the island\'s matchMedia check',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, '@media (prefers-reduced-motion: reduce)');
    assertStringIncludes(css, 'animation-duration: .01ms !important');
  },
});

Deno.test({
  name: 'prolegomenon.css: defines responsive breakpoints for tablet and mobile viewports',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, '@media (max-width: 900px)');
    assertStringIncludes(css, '@media (max-width: 580px)');
    // The mobile breakpoint repositions the island out of the absolutely
    // positioned hero corner and into the normal document flow.
    assertStringIncludes(css, '.quaternary-spheroid { position: relative; right: auto; bottom: auto;');
  },
});
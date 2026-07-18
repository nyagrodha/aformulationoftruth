/**
 * Tests for public/css/prolegomenon.css
 *
 * This stylesheet backs the new prolegomenon landing page (routes/index.tsx).
 * These are structural/regression tests: since CSS has no runtime behavior
 * to unit test directly, we verify the stylesheet is syntactically well
 * formed and that the selectors/rules relied upon by routes/index.tsx and
 * islands/QuaternarySpheroid.tsx are present.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

const CSS_PATH = new URL('../public/css/prolegomenon.css', import.meta.url);

async function readCss(): Promise<string> {
  return await Deno.readTextFile(CSS_PATH);
}

/** Returns the declaration body of the first rule whose selector text
 * contains `selectorText`, or null if no such rule exists. Assumes flat
 * (non-nested) CSS, which is true of this stylesheet. */
function getRuleBody(css: string, selectorText: string): string | null {
  const selectorIndex = css.indexOf(selectorText);
  if (selectorIndex === -1) return null;
  const openBrace = css.indexOf('{', selectorIndex);
  if (openBrace === -1) return null;
  const closeBrace = css.indexOf('}', openBrace);
  if (closeBrace === -1) return null;
  return css.slice(openBrace + 1, closeBrace);
}

Deno.test({
  name: 'prolegomenon.css - file exists and is non-empty',
  async fn() {
    const css = await readCss();
    assert(css.length > 0);
  },
});

Deno.test({
  name: 'prolegomenon.css - braces are balanced (no truncated/unclosed rules)',
  async fn() {
    const css = await readCss();
    const openCount = css.match(/\{/g)?.length ?? 0;
    const closeCount = css.match(/\}/g)?.length ?? 0;
    assertEquals(openCount, closeCount);
    assert(openCount > 0, 'expected at least one CSS rule');
  },
});

Deno.test({
  name: 'prolegomenon.css - declares the two @font-face families used by the page',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, 'font-family: "Noto Serif"');
    assertStringIncludes(css, 'src: url("/fonts/NotoSerif-Regular.ttf") format("truetype")');
    assertStringIncludes(css, 'font-family: "League Spartan"');
    assertStringIncludes(css, 'src: url("/fonts/LeagueSpartan-VF.woff2") format("woff2")');
  },
});

Deno.test({
  name: 'prolegomenon.css - :root defines the expected color custom properties',
  async fn() {
    const css = await readCss();
    const rootBody = getRuleBody(css, ':root');
    assert(rootBody !== null, ':root rule not found');
    for (
      const token of [
        '--paper:',
        '--paper-light:',
        '--ink:',
        '--muted:',
        '--saffron:',
        '--cyan:',
        '--rose:',
        '--indigo:',
        '--olive:',
        '--ochre:',
        '--verdigris:',
        '--rule:',
      ]
    ) {
      assertStringIncludes(rootBody!, token);
    }
  },
});

Deno.test({
  name: 'prolegomenon.css - defines layout rules for structural elements added by routes/index.tsx',
  async fn() {
    const css = await readCss();
    for (
      const selector of [
        '.site-header',
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
        '.folio',
        '.sequence',
        '.epigraph',
        '.movement',
        '.first-movement',
        '.question',
        '.answer',
        '.movement-index',
        '.section-break',
        '.begin-questionnaire',
        'footer',
      ]
    ) {
      assert(css.includes(selector), `expected selector "${selector}" to be defined`);
    }
  },
});

Deno.test({
  name: 'prolegomenon.css - .quaternary-spheroid rule positions and sizes the island container',
  async fn() {
    const css = await readCss();
    const body = getRuleBody(css, '.quaternary-spheroid {');
    assert(body !== null, '.quaternary-spheroid rule not found');
    assertStringIncludes(body!, 'position: absolute');
    assertStringIncludes(body!, 'cursor: crosshair');
    assertStringIncludes(body!, 'touch-action: none');
  },
});

Deno.test({
  name: 'prolegomenon.css - defines responsive breakpoints for tablet and mobile',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, '@media (max-width: 900px)');
    assertStringIncludes(css, '@media (max-width: 580px)');
  },
});

Deno.test({
  name: 'prolegomenon.css - respects prefers-reduced-motion',
  async fn() {
    const css = await readCss();
    assertStringIncludes(css, '@media (prefers-reduced-motion: reduce)');
    const reducedMotionIndex = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const snippet = css.slice(reducedMotionIndex, reducedMotionIndex + 400);
    assertStringIncludes(snippet, 'animation-duration: .01ms !important');
  },
});

Deno.test({
  name: 'prolegomenon.css - mobile breakpoint collapses the spheroid into static, in-flow layout',
  async fn() {
    const css = await readCss();
    const mobileIndex = css.indexOf('@media (max-width: 580px)');
    assert(mobileIndex !== -1);
    const mobileBlock = css.slice(mobileIndex);
    const overrideBody = getRuleBody(mobileBlock, '.quaternary-spheroid {');
    assert(overrideBody !== null, 'expected a mobile override for .quaternary-spheroid');
    assertStringIncludes(overrideBody!, 'position: relative');
  },
});
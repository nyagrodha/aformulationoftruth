/**
 * Stylesheet rules the nav depends on and no render test can see.
 */
import { assert, assertStringIncludes } from '$std/assert/mod.ts';

const navCss = await Deno.readTextFile('public/css/nav-mark.css');
const mainCss = await Deno.readTextFile('public/css/main.css');

Deno.test('links turn gold when clicked and on the current page', () => {
  assert(/\.nav-rays a:active,\s*\.nav-rays a\[aria-current='page'\]\s*\{[^}]*--wm-gold/.test(navCss));
});

Deno.test('the ௨ is centred: a three-column header', () => {
  assert(/grid-template-columns: (1fr|minmax\(0, 1fr\)) auto (1fr|minmax\(0, 1fr\))/.test(navCss));
});

Deno.test('main.css shows the dark rays', () => {
  assert(/\.nav-rays-art--light\s*\{\s*display:\s*none/.test(mainCss));
  assert(/\.nav-rays-art--dark\s*\{\s*display:\s*block/.test(mainCss));
});

Deno.test('reduced motion turns off the shrink and the fan', () => {
  const rm = navCss.slice(navCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  assertStringIncludes(rm.slice(0, rm.indexOf('}\n}') + 3), '.nav-rays');
});

Deno.test('the retired bar is gone', () => {
  assert(!navCss.includes('.nav-list'));
});

/*
 * The fan is 600px only where there is room for it, and a label beside a ray
 * wraps before it would leave the screen: "lotto · in the pipeline" at the
 * rightmost tip is ~220px wide, and at 481-724px it used to run off the page.
 */
Deno.test('the fan never outgrows the screen, and side labels stay on it', () => {
  assertStringIncludes(navCss, '--fan-w: min(600px, 100vw - 1.5rem)');
  const right = navCss.slice(navCss.indexOf('.nav-ray--right {'));
  assertStringIncludes(right.slice(0, right.indexOf('}')), 'max-width: calc(');
  const left = navCss.slice(navCss.indexOf('.nav-ray--left {'));
  assertStringIncludes(left.slice(0, left.indexOf('}')), 'max-width: calc(');
});

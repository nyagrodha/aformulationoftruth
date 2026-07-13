/**
 * QuaternarySpheroid Island Tests
 *
 * islands/QuaternarySpheroid.tsx renders a canvas-driven 4D sphere
 * visualization. All of the interesting animation logic (makeSphere, ease,
 * between, flight, and the pointer/canvas drawing loop inside useEffect)
 * lives inside browser-only closures that depend on globals which don't
 * exist under Deno (matchMedia, ResizeObserver, requestAnimationFrame,
 * CanvasRenderingContext2D). Those closures never run during server-side
 * rendering, since useEffect callbacks are only flushed after a real DOM
 * commit, which preact-render-to-string does not perform.
 *
 * These tests therefore focus on what actually executes on the server: the
 * component's static render output, which is exactly what Fresh ships for
 * this island before client-side hydration takes over.
 */

import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { h } from 'preact';
import render from 'https://esm.sh/preact-render-to-string@6.5.11?deps=preact@10.24.3';
import QuaternarySpheroid from '../islands/QuaternarySpheroid.tsx';

Deno.test({
  name: 'QuaternarySpheroid: is exported as a function component',
  fn() {
    assertEquals(typeof QuaternarySpheroid, 'function');
  },
});

Deno.test({
  name: 'QuaternarySpheroid: renders a hidden stage containing a canvas and a roman numeral sigil',
  fn() {
    const html = render(h(QuaternarySpheroid, {}));

    assertStringIncludes(html, 'class="quaternary-spheroid"');
    assertStringIncludes(html, 'aria-hidden="true"');
    assertStringIncludes(html, '<canvas');
    assertStringIncludes(html, 'class="spheroid-sigil"');
    assertStringIncludes(html, '>IV<');
  },
});

Deno.test({
  name: 'QuaternarySpheroid: renders no visible text content besides the "IV" sigil',
  fn() {
    const html = render(h(QuaternarySpheroid, {}));
    const textOnly = html.replace(/<[^>]*>/g, '').trim();

    assertEquals(textOnly, 'IV');
  },
});

Deno.test({
  name: 'QuaternarySpheroid: renders identically across independent mounts (no shared mutable state leaks)',
  fn() {
    const first = render(h(QuaternarySpheroid, {}));
    const second = render(h(QuaternarySpheroid, {}));

    assertEquals(first, second);
  },
});

Deno.test({
  name: 'QuaternarySpheroid: ignores unknown props passed in by a parent',
  fn() {
    // The component takes no props and always renders the same markup,
    // regardless of what a caller passes in.
    const withExtraProps = render(
      h(QuaternarySpheroid, { foo: 'bar', style: 'color:red' } as any),
    );
    const withoutProps = render(h(QuaternarySpheroid, {}));

    assertEquals(withExtraProps, withoutProps);
  },
});
/**
 * Index Route (Prolegomenon Landing Page) Tests
 *
 * routes/index.tsx was rewritten in this PR from a "hero + gate form"
 * landing page into a long-form "prolegomenon" page: a sequence of prose
 * movements, an epigraph, an inline SVG-less geometry diagram, and the new
 * QuaternarySpheroid canvas island, ending with a link into /gate.
 *
 * These tests cover:
 *   1. The route handler, which simply delegates to ctx.render().
 *   2. The rendered markup produced by the default-exported Home component,
 *      using preact-render-to-string (server-side rendering never invokes
 *      useEffect, matching how Fresh itself renders this page).
 */

import { assertEquals, assertExists, assertStringIncludes } from '$std/assert/mod.ts';
import { h } from 'preact';
import render from 'https://esm.sh/preact-render-to-string@6.5.11?deps=preact@10.24.3';
import Home, { handler } from '../routes/index.tsx';

Deno.test({
  name: 'index route: GET handler delegates to ctx.render() with no arguments',
  fn() {
    let renderArgs: unknown[] | undefined;
    const ctx = {
      render: (...args: unknown[]) => {
        renderArgs = args;
        return new Response('rendered');
      },
    };

    handler.GET!(new Request('http://localhost/'), ctx as any);

    assertExists(renderArgs);
    assertEquals(renderArgs, []);
  },
});

Deno.test({
  name: 'index route: GET handler returns exactly what ctx.render() produces',
  fn() {
    const rendered = new Response('ok');
    const ctx = { render: () => rendered };

    const response = handler.GET!(new Request('http://localhost/'), ctx as any);

    assertEquals(response, rendered);
  },
});

Deno.test({
  name: 'index route: Home renders the expected document head metadata',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, '<title>Prolegomenon');
    assertStringIncludes(html, 'href="/css/prolegomenon.css"');
    assertStringIncludes(html, 'name="description"');
  },
});

Deno.test({
  name: 'index route: Home renders the header nav with a link to /questions',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, 'class="site-header"');
    assertStringIncludes(html, 'href="/questions"');
  },
});

Deno.test({
  name: 'index route: Home renders the hero geometry diagram and the QuaternarySpheroid island',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, 'class="hero"');
    assertStringIncludes(html, 'class="geometry"');
    assertStringIncludes(html, 'class="axis axis-desire"');
    assertStringIncludes(html, 'class="axis axis-habit"');
    assertStringIncludes(html, 'class="quaternary-spheroid"');
    assertStringIncludes(html, 'class="spheroid-sigil"');
  },
});

Deno.test({
  name: 'index route: Home renders every movement section exactly once, in order',
  fn() {
    const html = render(h(Home, {}));

    for (let i = 1; i <= 12; i++) {
      assertStringIncludes(html, `class="movement movement-${i}"`);
    }

    const firstIndex = html.indexOf('class="movement movement-1"');
    const lastIndex = html.indexOf('class="movement movement-12"');
    // movement-1 must appear before movement-12 in the rendered document.
    assertEquals(firstIndex < lastIndex, true);
  },
});

Deno.test({
  name: 'index route: Home renders a section-break between movements, but not after the last one',
  fn() {
    const html = render(h(Home, {}));

    const separatorCount = html.split('class="section-break"').length - 1;
    // 12 movements => 11 separators between them, and none trailing the last.
    assertEquals(separatorCount, 11);
  },
});

Deno.test({
  name: 'index route: Home links to /gate to begin the questionnaire',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, 'href="/gate"');
    assertStringIncludes(html, 'Begin the questionnaire');
  },
});

Deno.test({
  name: 'index route: Home renders the epigraph attributed to Gerard Manley Hopkins',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, 'class="epigraph"');
    assertStringIncludes(html, 'Gerard Manley Hopkins');
  },
});

Deno.test({
  name: 'index route: Home renders a footer with a link back to the top of the page',
  fn() {
    const html = render(h(Home, {}));

    assertStringIncludes(html, '<footer');
    assertStringIncludes(html, 'href="#top"');
  },
});
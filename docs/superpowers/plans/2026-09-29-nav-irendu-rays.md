# Nav: the irendu with seven rays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the site's top-left ௨ toggle and horizontal link bar with a centred ௨ that, when clicked, shrinks and fans seven Brooch-style glowing rays beneath it, one nav destination at each ray's tip.

**Architecture:**
- A Python generator draws the rays with the Brooch's geometry into two WebP images (light and dark ground) and writes each ray's tip position to `data/nav-rays.ts`.
- `islands/Nav.tsx` renders the images plus an ordered list, positioning each label at its ray's tip from that data file. Pipeline items are plain text, and the current page is marked on the server.
- `public/css/nav-mark.css` lays out the centred header, the fan, the gold states and the narrow-screen list.

**Tech Stack:** Deno 2 + Fresh 1.7.3 islands (Preact), `preact-render-to-string` tests, Python 3 + Pillow 10.2 + NumPy (generator only; WebP support verified).

**Spec:** `docs/superpowers/specs/2026-09-29-nav-irendu-rays-design.md` (branch `feat/nav-irendu-rays`). Geometry source: `~/Projects/ESP32/brooch/tools/compose_splash.py`.

## Global Constraints

- Every page, landing included, uses the rays; the horizontal bar is removed, not flagged.
- The seven, left to right: begin · about · people · gift shop · heard on the mesh · messenger · lotto.
- messenger and lotto: `pipeline: true`, no `href`, rendered as text `"<label> · in the pipeline"`, never an `<a>`.
- All seven rays equally bright; only the label marks a pipeline item.
- Rays end where labels begin; only the label is clickable.
- Link gold on `:active` and on `aria-current='page'`: `var(--wm-gold, #8a6d00)` on paper, `#ffd600` on the black main.css pages.
- `current` is decided on the server (a prop), never from `location` on the client.
- No-JS (Tor safest mode): the fan renders open with the ௨ already small.
- `prefers-reduced-motion`: no scale/fade transitions.
- Brooch constants copied verbatim: `BASE_FX, BASE_FY = 0.537, 0.914`, `RAYS = 7`, `RAY_SPREAD = (18.0, 162.0)`, `RAY_ELLIPSE = (60.0, 14.0)` at a 141 px spiral, `RAY_CORE_W, RAY_GLOW_W, RAY_GLOW_BLUR = 1.5, 4.0, 2.8`, `RAY_LEN_SCALE = [1.0, 1.35, 1.0, 1.0, 1.35, 1.0, 1.0]`.
- Code style: `deno fmt` (single quotes, 2 spaces, width 120, semicolons). Never `deno fmt` a file that uses double quotes (e.g. `routes/lotto.tsx`); edit it by hand.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A caller passing fewer or more items than there are rays** (the existing tests pass two; a future list might pass eight): expected to render every item without throwing; items beyond the seventh ray get no position and fall into the below-fan list. Pinned in Task 2 (`items beyond the rays still render`).
2. **`current` set to `/` on the landing page, where begin is a fragment:** expected that no item is marked current. Pinned in Task 2 (`fragments are never current`).
3. **Regenerating the art without regenerating the data** (or the reverse): expected to fail a test, not to ship labels floating off their rays. Pinned in Task 1 (`image size matches the data`).
4. **A dark main.css page showing the light-ground rays** (dark gold on black, near-invisible): expected that main.css swaps to the dark art. Pinned in Task 3 (`main.css shows the dark rays`).
5. **Keyboard users tabbing into the fan:** expected to reach the five links in fan order and skip the two pipeline labels, with no stray focusable wrapper. Pinned in Task 2 (`pipeline items are not focusable`).

---

### Task 1: The ray artwork and its position data

**Files:**
- Create: `tools/compose-nav-rays.py`
- Create (generated): `public/images/nav-rays-light.webp`, `public/images/nav-rays-dark.webp`, `data/nav-rays.ts`
- Test: `data/nav-rays_test.ts`

**Interfaces:**
- Produces: `data/nav-rays.ts` exporting

```ts
export interface NavRay {
  /** Tip of the ray, as a percentage of the fan box. */
  x: number;
  y: number;
  /** Degrees below horizontal; 162 is the leftmost ray, 18 the rightmost. */
  angle: number;
  /** Which way the label runs from the tip. */
  side: 'left' | 'right' | 'below';
}
export const NAV_RAYS: {
  width: number; // CSS px of the fan box
  height: number;
  markWidth: number; // CSS px of the ௨ when open
  light: string; // image URLs
  dark: string;
  rays: NavRay[]; // left to right, 7 entries
};
```

- [ ] **Step 1: Write the failing test** — `data/nav-rays_test.ts`

```ts
/**
 * The generated ray data must describe the generated images. Both come out of
 * tools/compose-nav-rays.py; regenerating one without the other would float the
 * labels off their rays, and nothing visual would catch it in review.
 */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { NAV_RAYS } from './nav-rays.ts';

/** Width and height from a WebP header (VP8X, VP8L or VP8 ). */
function webpSize(b: Uint8Array): [number, number] {
  const tag = new TextDecoder().decode(b.slice(12, 16));
  if (tag === 'VP8X') {
    return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  }
  if (tag === 'VP8L') {
    const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  if (tag === 'VP8 ') return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  throw new Error(`unknown webp chunk ${tag}`);
}

Deno.test('nav rays - seven rays, left to right, tips inside the box', () => {
  assertEquals(NAV_RAYS.rays.length, 7);
  for (let i = 1; i < 7; i++) assert(NAV_RAYS.rays[i].angle < NAV_RAYS.rays[i - 1].angle, 'left to right');
  for (const r of NAV_RAYS.rays) {
    assert(r.x > 0 && r.x < 100 && r.y > 0 && r.y < 100, `tip ${r.x},${r.y} outside the box`);
    assert(['left', 'right', 'below'].includes(r.side));
  }
});

Deno.test('nav rays - image size matches the data, at 3x', async () => {
  for (const url of [NAV_RAYS.light, NAV_RAYS.dark]) {
    const bytes = await Deno.readFile(`public${url}`);
    assertEquals(webpSize(bytes), [NAV_RAYS.width * 3, NAV_RAYS.height * 3], url);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-read data/nav-rays_test.ts`
Expected: FAIL — `Module not found "file:///…/data/nav-rays.ts"`.

- [ ] **Step 3: Write the generator** — `tools/compose-nav-rays.py`

```python
#!/usr/bin/env python3
"""Draw the nav's seven rays, after the Brooch wearable's boot screen.

The geometry is ~/Projects/ESP32/brooch/tools/compose_splash.py's, constants
copied verbatim: seven lens-shaped rays, a sharp core over a blurred glow,
fanning 18..162 degrees below horizontal off an ellipse around the spiral's
base stroke, the 2nd and 5th longer. Two things differ, both because a web nav
is not a 172x320 screen:

- The spiral is not drawn. The page already paints nav-irendu-372.webp; this
  draws only the rays, on transparent, positioned so the fan leaves the ௨'s base
  stroke when the mark is MARK_W wide and centred at the top of the box.
- Rays are longer (RAY_LEN): the Brooch's 17 px would end inside the spiral at
  this size, and each ray must reach its label.

Writes the rays at 3x for 3x displays (the rule nav-irendu-372.webp follows),
once per ground, and data/nav-rays.ts with each ray's tip as a percentage of the
box, so the links are positioned from the same numbers that drew the art.

    python3 tools/compose-nav-rays.py && deno fmt data/nav-rays.ts
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
W, H, SS = 600, 230, 3  # fan box in CSS px; drawn at 3x
MARK_W = 74  # the ௨ when open: 60% of its 124 px closed width
MARK_H = MARK_W * 252 / 372  # nav-irendu-372.webp is 372x252

# Brooch geometry, verbatim (compose_splash.py).
BASE_FX, BASE_FY = 0.537, 0.914
RAYS = 7
RAY_SPREAD = (18.0, 162.0)
BROOCH_SPIRAL_W = 141
RAY_ELLIPSE = (60.0, 14.0)
RAY_CORE_W, RAY_GLOW_W, RAY_GLOW_BLUR = 1.5, 4.0, 2.8
RAY_LEN_SCALE = [1.0, 1.35, 1.0, 1.0, 1.35, 1.0, 1.0]  # left to right

RAY_LEN = 110.0  # px at 1x

# (core, glow) per ground. Light: the wordmark's paper gold family; dark: the ink triad's gold.
VARIANTS = {
    "light": ((0x6E, 0x57, 0x00), (0xB8, 0x92, 0x0A)),
    "dark": ((0xFF, 0xF1, 0xA8), (0xFF, 0xD6, 0x00)),
}


def lens(x0, y0, x1, y1, w):
    """Pointed at both ends, widest at the middle (the Brooch's ray_polygon)."""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    px, py = -dy / n * w / 2, dx / n * w / 2
    return [(x0, y0), (mx + px, my + py), (x1, y1), (mx - px, my - py)]


def geometry():
    """Per ray, left to right: (angle, start, tip) in 1x px."""
    cx = W / 2 + (BASE_FX - 0.5) * MARK_W
    cy = BASE_FY * MARK_H
    k = MARK_W / BROOCH_SPIRAL_W
    ex, ey = RAY_ELLIPSE[0] * k, RAY_ELLIPSE[1] * k
    out = []
    for i in range(RAYS):
        # Left to right: 162 degrees first, 18 last.
        a = RAY_SPREAD[1] - i * (RAY_SPREAD[1] - RAY_SPREAD[0]) / (RAYS - 1)
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        x0, y0 = cx + ex * c, cy + ey * s
        L = RAY_LEN * RAY_LEN_SCALE[i]
        out.append((a, (x0, y0), (x0 + L * c, y0 + L * s)))
    return out


def draw(core_rgb, glow_rgb, rays):
    core = Image.new("L", (W * SS, H * SS))
    glow = Image.new("L", (W * SS, H * SS))
    for _, (x0, y0), (x1, y1) in rays:
        pts = lambda w: [(x * SS, y * SS) for x, y in lens(x0, y0, x1, y1, w)]
        ImageDraw.Draw(core).polygon(pts(RAY_CORE_W), fill=255)
        ImageDraw.Draw(glow).polygon(pts(RAY_GLOW_W), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(RAY_GLOW_BLUR * SS))
    c = np.asarray(core, float) / 255
    g = np.asarray(glow, float) / 255 * 0.75
    alpha = np.maximum(c, g)
    rgb = np.empty((H * SS, W * SS, 3))
    for ch in range(3):
        rgb[..., ch] = glow_rgb[ch] * (1 - c) + core_rgb[ch] * c
    rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def side(a):
    return "left" if a > 100 else "right" if a < 80 else "below"


def main():
    rays = geometry()
    for name, (core_rgb, glow_rgb) in VARIANTS.items():
        draw(core_rgb, glow_rgb, rays).save(ROOT / f"public/images/nav-rays-{name}.webp", "WEBP", lossless=True)
    entries = ",\n".join(
        f"    {{ x: {x1 / W * 100:.2f}, y: {y1 / H * 100:.2f}, angle: {a:.0f}, side: '{side(a)}' }}"
        for a, _, (x1, y1) in rays
    )
    (ROOT / "data/nav-rays.ts").write_text(f"""// Generated by tools/compose-nav-rays.py; do not edit. Rerun it after any change there.

export interface NavRay {{
  /** Tip of the ray, as a percentage of the fan box. */
  x: number;
  y: number;
  /** Degrees below horizontal; 162 is the leftmost ray, 18 the rightmost. */
  angle: number;
  /** Which way the label runs from the tip. */
  side: 'left' | 'right' | 'below';
}}

export const NAV_RAYS: {{
  width: number;
  height: number;
  markWidth: number;
  light: string;
  dark: string;
  rays: NavRay[];
}} = {{
  width: {W},
  height: {H},
  markWidth: {MARK_W},
  light: '/images/nav-rays-light.webp',
  dark: '/images/nav-rays-dark.webp',
  rays: [
{entries},
  ],
}};
""")
    print(f"wrote 2 images at {W * SS}x{H * SS} and data/nav-rays.ts")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Generate the outputs**

Run: `python3 tools/compose-nav-rays.py && deno fmt data/nav-rays.ts`
Expected: `wrote 2 images at 1800x690 and data/nav-rays.ts`; two `.webp` files appear under `public/images/`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `deno test --allow-read data/nav-rays_test.ts`
Expected: `ok | 2 passed | 0 failed`.

- [ ] **Step 6: Look at the art**

Open both `.webp` files in an image viewer (or `python3 -c "from PIL import Image; Image.open('public/images/nav-rays-dark.webp').show()"`). Expected: seven gold lens-shaped rays fanning downward from a point near the top centre, with the 2nd and 5th from the left visibly longer; transparent elsewhere.

- [ ] **Step 7: Commit**

```bash
git add tools/compose-nav-rays.py public/images/nav-rays-light.webp public/images/nav-rays-dark.webp data/nav-rays.ts data/nav-rays_test.ts
git commit -m "feat(nav): seven rays after the Brooch splash -- artwork and tip positions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nav items and markup — seven rays, pipeline text, the current page

**Files:**
- Modify: `components/nav-shared.ts` (the `NavItem` type moves here, `PAGE_NAV` grows to seven, `LANDING_NAV` moves here, `NAV_NOSCRIPT_CSS` changes)
- Modify: `islands/Nav.tsx` (whole render; toggle logic unchanged)
- Modify: `routes/index.tsx:42-47` (delete the local `LANDING_NAV`, import it)
- Test: `islands/Nav_test.tsx`

**Interfaces:**
- Consumes: `NAV_RAYS` from `data/nav-rays.ts` (Task 1).
- Produces:
  - `export interface NavItem { label: string; href?: string; pipeline?: boolean }` in `components/nav-shared.ts`
  - `PAGE_NAV`, `LANDING_NAV`, `NAV_NOSCRIPT_CSS` in `components/nav-shared.ts`
  - `Nav({ items, current }: { items: NavItem[]; current?: string })` in `islands/Nav.tsx`
  - Class names Task 3 styles: `.site-nav`, `.nav-spacer`, `.nav-toggle`, `.nav-mark`, `.nav-rays`, `.nav-rays-art`, `.nav-rays-art--light`, `.nav-rays-art--dark`, `.nav-rays-list`, `.nav-ray`, `.nav-ray--left|right|below`, `.nav-ray-pipeline`; inline custom properties `--x`, `--y` on each positioned `li`.

`NavItem` currently lives in `islands/Nav.tsx` and `nav-shared.ts` imports it from there. Moving it to `nav-shared.ts` breaks that cycle; `islands/Nav.tsx` re-exports it (`export type { NavItem }`) so any other importer keeps working.

- [ ] **Step 1: Find every importer of the moved names**

Run: `grep -rn "NavItem\|NAV_NOSCRIPT_CSS\|LANDING_NAV\|nav-list" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: a list including `islands/Nav.tsx`, `components/nav-shared.ts`, `routes/index.tsx`, the callers' `<noscript>` blocks, and any test asserting `nav-list`. Every hit that asserts `.nav-list` or `display:flex` must be updated in Step 2 or Step 5.

- [ ] **Step 2: Write the failing tests** — replace the last test in `islands/Nav_test.tsx` ("PAGE_NAV points at nothing that does not exist") and append the rest:

```tsx
import { LANDING_NAV, NAV_NOSCRIPT_CSS } from '../components/nav-shared.ts';

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
  assertEquals(LANDING_NAV.map((i) => [i.label, i.pipeline ?? false]), PAGE_NAV.map((i) => [i.label, i.pipeline ?? false]));
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
  const eight = [...PAGE_NAV.slice(0, 5), { label: 'a', href: '/a' }, { label: 'b', href: '/b' }, { label: 'c', href: '/c' }];
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `deno test --allow-read islands/Nav_test.tsx`
Expected: FAIL — `LANDING_NAV` is not exported from `nav-shared.ts`, and the seven-item assertions fail.

- [ ] **Step 4: Write `components/nav-shared.ts`**

```ts
/**
 * One nav destination. `pipeline` items are listed but not yet built: they
 * render as text reading "<label> · in the pipeline" and carry no href, so
 * nobody lands on an unfinished page.
 */
export interface NavItem {
  label: string;
  href?: string;
  pipeline?: boolean;
}

/**
 * The rule that shows the nav when there is no script to open it.
 *
 * `Nav` is an island, so its toggle is inert until Fresh hydrates it and inert
 * forever if scripting is off (Tor Browser's safest mode). Every page drops this
 * into a <noscript> block: the fan renders open, with the ௨ already at its open
 * size, instead of leaving a dead control.
 *
 * The [hidden] attribute only carries `display: none` at UA weight; restate the
 * open display rather than relying on removing `hidden`.
 */
export const NAV_NOSCRIPT_CSS = '.nav-rays[hidden]{display:block}.nav-mark{width:74px}';

/**
 * The nav for every page that is not the landing page, left to right across the
 * fan: item k sits at the tip of ray k (data/nav-rays.ts).
 *
 * `begin` is '/#begin' and not '#begin' because that fragment lives on the
 * landing document alone -- see LANDING_NAV, which is why Nav takes items as a
 * prop at all.
 */
export const PAGE_NAV: NavItem[] = [
  { label: 'begin', href: '/#begin' },
  { label: 'about', href: '/about' },
  { label: 'people', href: '/people' },
  { label: 'gift shop', href: '/shop' },
  { label: 'heard on the mesh', href: '/loramesh' },
  { label: 'messenger', pipeline: true },
  { label: 'lotto', pipeline: true },
];

/** The landing page navigates itself by fragment for begin and about; the rest match PAGE_NAV. */
export const LANDING_NAV: NavItem[] = [
  { label: 'begin', href: '#begin' },
  { label: 'about', href: '#about' },
  ...PAGE_NAV.slice(2),
];
```

- [ ] **Step 5: Write `islands/Nav.tsx`**

Keep the file header comment, `MARK_SRC`, `IrenduMark`, and every hook (`open`, `root`, `toggle`, `live`, the Escape/outside-click effect) exactly as they are. Replace the imports, the `NavItem` interface and the component's signature and `return`:

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { WordmarkGlyphs } from '../components/Wordmark.tsx';
import type { NavItem } from '../components/nav-shared.ts';
import { NAV_RAYS } from '../data/nav-rays.ts';

export type { NavItem };
```

```tsx
export default function Nav({ items, current }: { items: NavItem[]; current?: string }) {
  // ...state, refs and effects unchanged...

  return (
    <nav class='site-nav' aria-label='Primary navigation' ref={root}>
      {/* Balances the wordmark so the ௨ sits at the true centre of the header. */}
      <span class='nav-spacer' aria-hidden='true' />

      {/* toggle: unchanged button/span pair, including aria-controls='nav-list' */}

      {/* wordmark link home: unchanged */}

      {
        /*
         * The rays are artwork (empty alt); the list over them is the navigation.
         * Two images because the glow that reads on paper vanishes on black and
         * the reverse -- the stylesheet shows the one that suits the page.
         */
      }
      <div id='nav-list' class='nav-rays' hidden={!open}>
        <img
          class='nav-rays-art nav-rays-art--light'
          src={NAV_RAYS.light}
          alt=''
          width={NAV_RAYS.width}
          height={NAV_RAYS.height}
          decoding='async'
        />
        <img
          class='nav-rays-art nav-rays-art--dark'
          src={NAV_RAYS.dark}
          alt=''
          width={NAV_RAYS.width}
          height={NAV_RAYS.height}
          decoding='async'
        />
        <ol class='nav-rays-list'>
          {items.map((item, i) => {
            const ray = NAV_RAYS.rays[i];
            /* Beyond the seventh ray there is no tip; such an item joins the list below the fan. */
            const side = ray?.side ?? 'below';
            const style = ray ? `--x:${ray.x}%;--y:${ray.y}%` : undefined;
            return (
              <li key={item.label} class={`nav-ray nav-ray--${side}`} style={style}>
                {item.pipeline || !item.href
                  ? <span class='nav-ray-pipeline'>{item.label} · in the pipeline</span>
                  : (
                    <a
                      href={item.href}
                      aria-current={item.href === current ? 'page' : undefined}
                      /* Fragment links don't unmount the island, so close on the way out. */
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                  )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
```

Note: `items beyond the rays still render` passes an eighth item with no ray, so that `li` gets `nav-ray--below` and no `style`. A fragment href (`#begin`) can never equal a path like `/`, so fragments are never current without special-casing.

- [ ] **Step 6: Point `routes/index.tsx` at the shared list**

Delete the local `const LANDING_NAV: NavItem[] = [ ... ];` block (lines 42–47) and change the nav-shared import to include it:

```tsx
import { LANDING_NAV, NAV_NOSCRIPT_CSS } from '../components/nav-shared.ts';
```

If `NavItem` was imported in `routes/index.tsx` only for that constant, remove it from the import.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `deno fmt components/nav-shared.ts islands/Nav.tsx islands/Nav_test.tsx && deno test --allow-read islands/Nav_test.tsx && deno check routes/index.tsx components/PageShell.tsx`
Expected: all Nav tests pass (the earlier tests — wordmark, inert toggle, irendu `<img>` first with empty alt and 372×252 — still pass, since the toggle precedes the rays in the markup); `deno check` clean.

- [ ] **Step 8: Commit**

```bash
git add components/nav-shared.ts islands/Nav.tsx islands/Nav_test.tsx routes/index.tsx
git commit -m "feat(nav): seven destinations on the rays; pipeline items as text; current page marked on the server

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Layout, gold, dark pages, and the current page on its routes

**Files:**
- Modify: `public/css/nav-mark.css` (replace everything from the `.nav-list` comment block to the end of the file; restyle `.site-nav`, `.nav-toggle`, `.nav-mark`)
- Modify: `public/css/main.css` (append the dark-art swap)
- Modify: `components/PageShell.tsx:34-57` (optional `current` prop passed to `Nav`)
- Modify: `routes/about.tsx`, `routes/shop.tsx`, `routes/loramesh.tsx` (pass `current`)
- Test: `islands/nav_css_test.ts` (new)

**Interfaces:**
- Consumes: class names and `--x`/`--y` from Task 2; `NAV_RAYS.width/height/markWidth` = 600/230/74 from Task 1.
- Produces: `PageShell({ title, description, current?, children })`.

- [ ] **Step 1: Write the failing test** — `islands/nav_css_test.ts`

```ts
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
  assertStringIncludes(navCss, 'grid-template-columns: 1fr auto 1fr');
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-read islands/nav_css_test.ts`
Expected: FAIL on the gold, grid, main.css and bar tests.

- [ ] **Step 3: Rewrite the layout rules in `public/css/nav-mark.css`**

Replace the top-of-file layout comment's second paragraph with a note that the nav is now a centred ௨ with a ray fan (spec path), then replace `.site-nav`, `.nav-toggle`, `.nav-mark` and its `rotate` rule, and **everything from the `.nav-list` comment to the end of the file**, with:

```css
/*
 * Three columns so the ௨ sits at the true centre whatever the wordmark's width:
 * an empty spacer, the mark, the wordmark. The fan hangs from the mark.
 */
.site-nav {
  position: relative;
  display: grid;
  flex: 1;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
}

.site-nav a.wordmark-home {
  justify-self: end;
}

.nav-toggle {
  display: flex;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
}

button.nav-toggle {
  cursor: pointer;
}

/* 124px closed; 74px open, the size tools/compose-nav-rays.py drew the fan around. */
.nav-mark {
  display: block;
  width: clamp(96px, 10vw, 124px);
  height: auto;
  transition: width 0.25s ease;
}

.nav-toggle[aria-expanded='true'] .nav-mark {
  width: 74px;
}

/*
 * The fan: 600x230, centred under the mark, its top level with the open mark's
 * top (the mark is vertically centred in the header; 25px is half its 50px open
 * height). Out of flow, so opening it never shoves the page down; translucent
 * and blurred so it can sit over text, as the bar did.
 */
.nav-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 600px;
  aspect-ratio: 600 / 230;
  margin-top: -25px;
  transform: translateX(-50%);
  border-radius: 0 0 1.5rem 1.5rem;
  background: color-mix(in srgb, var(--paper, #e8ddc5) 80%, transparent);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  animation: nav-rays-in 0.3s ease;
}

@supports not (background: color-mix(in srgb, red 50%, transparent)) {
  .nav-rays {
    background: var(--paper, #e8ddc5);
  }
}

.nav-rays[hidden] {
  display: none;
}

@keyframes nav-rays-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.85);
  }
}

.nav-rays-art {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
}

.nav-rays-art--dark {
  display: none;
}

.nav-rays-list {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Each label starts where its ray ends: the ray is art, only the label is a link. */
.nav-ray {
  position: absolute;
  top: var(--y);
  left: var(--x);
  margin: 0;
  white-space: nowrap;
}

.nav-ray--right {
  transform: translate(0.4em, -50%);
}

.nav-ray--left {
  transform: translate(calc(-100% - 0.4em), -50%);
}

.nav-ray--below {
  transform: translate(-50%, 0.3em);
}

.nav-rays a,
.nav-ray-pipeline {
  display: block;
  padding: 0.2rem 0;
}

.nav-ray-pipeline {
  opacity: 0.7;
  font-style: italic;
}

.nav-rays a:active,
.nav-rays a[aria-current='page'] {
  color: var(--wm-gold, #8a6d00);
}

@media (prefers-reduced-motion: reduce) {
  .nav-mark,
  .nav-rays {
    transition: none;
    animation: none;
  }
}

/*
 * Seven labels on angled tips do not fit 360px legibly. Below 480px the fan
 * stays, full width and in flow, and the labels drop beneath it as a two-column
 * list in fan order, each led by a short bright ray.
 */
@media (max-width: 480px) {
  .site-header {
    height: auto;
    min-height: 68px;
  }

  .site-nav {
    grid-template-columns: 0 auto 1fr;
    row-gap: 0.5rem;
  }

  .nav-rays {
    position: static;
    grid-column: 1 / -1;
    width: 100%;
    aspect-ratio: auto;
    margin: 0;
    transform: none;
    animation: none;
  }

  .nav-rays-list {
    position: static;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 1rem;
    padding: 0.5rem 0.25rem 0.75rem;
  }

  .nav-ray,
  .nav-ray--left,
  .nav-ray--right,
  .nav-ray--below {
    position: static;
    transform: none;
    white-space: normal;
  }

  .nav-ray::before {
    content: '';
    display: inline-block;
    width: 1.1em;
    height: 2px;
    margin-right: 0.45em;
    vertical-align: middle;
    background: var(--wm-gold, #8a6d00);
    box-shadow: 0 0 4px var(--wm-gold, #8a6d00);
  }

  .nav-rays a,
  .nav-ray-pipeline {
    display: inline;
  }
}
```

Keep the existing `.site-nav a.wordmark-home` typography rule and the `.wordmark-home > [aria-hidden='true']` rule; add `justify-self: end` to the former rather than duplicating it.

- [ ] **Step 4: Append the dark swap to `public/css/main.css`**

```css
/*
 * The nav's rays (nav-mark.css) default to the paper-ground art. These pages are
 * black, where that dark gold all but vanishes, so show the ink-ground art and
 * the ink gold instead.
 */
.nav-rays-art--light {
    display: none;
}

.nav-rays-art--dark {
    display: block;
}

.nav-rays {
    --wm-gold: #ffd600;
    background: color-mix(in srgb, var(--void, #000) 80%, transparent);
}
```

- [ ] **Step 5: Run the CSS tests to verify they pass**

Run: `deno test --allow-read islands/nav_css_test.ts`
Expected: `ok | 5 passed | 0 failed`.

- [ ] **Step 6: Pass the current page from `PageShell` and its three nav destinations**

In `components/PageShell.tsx`, add `current` to the props and pass it through:

```tsx
export function PageShell(
  { title, description, current, children }: {
    title: string;
    description: string;
    /** This page's path when it is a nav destination, so its ray label stays gold. */
    current?: string;
    children: ComponentChildren;
  },
) {
```

```tsx
          <Nav items={PAGE_NAV} current={current} />
```

Then add `current='/about'` to the `<PageShell` in `routes/about.tsx`, `current='/shop'` in `routes/shop.tsx`, and `current='/loramesh'` in `routes/loramesh.tsx`. (`/people` renders no nav, so it passes nothing.)

Run: `deno check components/PageShell.tsx routes/about.tsx routes/shop.tsx routes/loramesh.tsx`
Expected: clean.

- [ ] **Step 7: Run the whole affected suite**

Run: `deno test --allow-env --allow-read --allow-net islands/ data/nav-rays_test.ts tests/completion_page_test.tsx tests/static_pages_urls_test.ts routes/`
Expected: everything passes except the known, pre-existing `/4m special case` failure in `static_pages_urls_test.ts` (it fails identically on `production`; it needs a database).

- [ ] **Step 8: Look at it in a browser**

Run: `PORT=8393 deno task dev` (not `.env`'s PORT, which `deno task dev` ignores). Check, and adjust only `margin-top` on `.nav-rays` or the `.nav-ray--*` translate offsets if the fan or labels sit off their rays:

- `/about` at 1280px: ௨ centred, wordmark right. Click the ௨: it shrinks, the fan opens with its rays leaving the ௨'s base stroke, each label just past its tip; "about" is gold; messenger and lotto read "… · in the pipeline" and are not clickable.
- Press a link and hold: it turns gold. Escape closes and returns focus to the ௨; a click outside closes.
- `/` (landing): same fan; begin and about scroll within the page.
- `/profile-choice` (black page): dark-ground rays, gold `#ffd600`.
- 360px width: fan full width, labels in two columns below it, each with a short ray.
- JavaScript disabled: the fan is open on load with the ௨ small.
- Reduced motion on (OS setting or DevTools emulation): no shrink animation or fade.

- [ ] **Step 9: Commit**

```bash
git add public/css/nav-mark.css public/css/main.css components/PageShell.tsx routes/about.tsx routes/shop.tsx routes/loramesh.tsx islands/nav_css_test.ts
git commit -m "feat(nav): the centred ௨ fans its rays; gold on click and on the current page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

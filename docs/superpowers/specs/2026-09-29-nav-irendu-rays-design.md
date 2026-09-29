# Nav: the irendu with seven rays — design

**Date:** 2026-09-29
**Status:** Draft, awaiting review
**Supersedes:** the top-left toggle and horizontal bar of
`2026-08-02-nav-five-line-mark-design.md`, on every page

## Goal

On every page, the landing page included, the primary nav becomes the Brooch
wearable's boot screen: the irendu (௨) sits **centred** in the header, and
clicking it **shrinks** it while **seven glowing rays** fan out beneath it. Each
ray ends in one nav destination.

The model is `~/Projects/ESP32/brooch/tools/compose_splash.py`: seven lens-shaped
rays with a blurred glow, fanning from 18° to 162° below horizontal off an
ellipse around the spiral's base stroke, with the 2nd and 5th rays 1.35× longer.

## Decisions (owner, 2026-09-29)

| Question | Decision |
|---|---|
| Rays vs links | **Seven links, one per ray** |
| The seven | begin · about · people · gift shop · heard on the mesh · messenger · lotto |
| messenger, lotto | Shown as **in the pipeline**: labelled so, **not links** |
| Pipeline rays | **Bright**, same as the rest; only the label marks them |
| Rendering | **Rays baked into an image**, as the Brooch does — closest to the splash |
| Landing page | **Gets the rays too** (owner, same day); keeps its own in-page `#begin` / `#about` hrefs |
| Wordmark | Stays top-right, a link home |

## What changes

### 1. Artwork: `tools/compose-nav-rays.py` (new)

Adapted from the Brooch script, keeping its ray geometry constants verbatim
(`RAYS`, `RAY_SPREAD`, `RAY_ELLIPSE`, `RAY_LEN_SCALE`, the lens polygon, the
core + blurred glow). Differences from the Brooch:

- Renders the **rays alone** on a transparent ground, at **3×** the largest size
  it is painted (the same rule `nav-irendu-372.webp` follows), so it stays crisp
  on 3× displays. The ௨ itself remains the existing `nav-irendu-372.webp`,
  positioned above the rays; the script records where the spiral's base stroke
  sits so the two line up.
- Ray length is scaled up from the Brooch's 17 px so each ray can carry a label
  at its tip at desktop size.
- Writes **two variants**, `public/images/nav-rays-light.webp` and
  `nav-rays-dark.webp`: a glow that reads on the dark ground washes out on
  `--paper`, the same problem the wordmark triad had (see the `--wm-*` notes in
  `prolegomenon.css`). Colours are chosen to hold ≥ 3:1 against each ground.
- Writes **`data/nav-rays.ts`**: for each ray, its tip as a percentage of the
  image box (`{ x, y, angle }`), plus the image's intrinsic size. The links are
  positioned from this file, so regenerating the art moves the links with it.

Committed outputs; the script is run by hand after an art change, like
`scripts/sync-tip-jar.tsx`.

### 2. `components/nav-shared.ts`

`NavItem` gains an optional `pipeline?: boolean`. `PAGE_NAV` becomes seven items:

| # | label | href | pipeline |
|---|---|---|---|
| 1 | begin | `/#begin` | |
| 2 | about | `/about` | |
| 3 | people | `/people` | |
| 4 | gift shop | `/shop` | |
| 5 | heard on the mesh | `/loramesh` | |
| 6 | messenger | — | yes |
| 7 | lotto | — | yes |

Order is left to right across the fan. A pipeline item has no `href`.

`LANDING_NAV` in `routes/index.tsx` becomes the same seven, differing only in
that begin and about stay in-page (`#begin`, `#about`) — the reason `Nav` takes
items as a prop at all. Both lists must keep the same labels in the same order,
so the fan reads identically on every page; a test pins that.

### 3. `islands/Nav.tsx`: the rays replace the bar

The horizontal bar has no caller left once the landing page moves too, so it is
removed rather than kept behind a flag. `Nav`'s props do not change (`items`),
so no caller changes except for the longer item lists.

Markup, in order:

1. The ௨ toggle — a `<button>` once hydrated, a `<span>` before, exactly as
   today — now centred in the header.
2. The wordmark link home, top-right, unchanged.
3. `<div class='nav-rays' id='nav-list' hidden={!open}>` containing the rays
   `<img>` (empty `alt`: ornament) and an `<ol>` of seven items. Each `<li>` is
   absolutely positioned at its ray's tip from `data/nav-rays.ts`.
   - A normal item is an `<a>` whose **visible label is its text**. Its hit area
     covers the label and the outer part of its ray.
   - A pipeline item is a `<span>` reading **"messenger · in the pipeline"**,
     with no link and no hit area.

Behaviour:

- **Open:** the toggle gets `aria-expanded='true'`; the ௨ scales to ~60%; the
  rays fade and scale in from the base stroke.
- **Close:** Escape (focus returns to the ௨), a pointer-down outside the nav, or
  following a link — the same handlers as today.
- **`prefers-reduced-motion`:** no scale or fade; the fan appears and disappears.

### 4. `public/css/nav-mark.css`

The `.nav-list` bar rules are replaced by: three-column header grid (empty · ௨ · wordmark) so
the mark is truly centred regardless of the wordmark's width; the fan is laid
over the page below the header (it must not push content down, and must not sit
on text unreadably — it gets the same translucent backing the current bar has).

**Narrow screens (< 480 px):** seven labels at angled ray tips will not fit
legibly in 360 px. Below the breakpoint the rays image stays, smaller, and the
labels drop beneath it as a two-column list in fan order, each led by a short
bright ray glyph so the correspondence reads.

### 5. No JavaScript

The site must work in Tor Browser's safest mode. `NAV_NOSCRIPT_CSS` gains a rule
for the rays variant: the fan renders **open**, with the ௨ already small. The
existing `<noscript>` blocks in every caller pick it up unchanged, since they
inline the shared constant.

## Testing

Additions to `islands/Nav_test.tsx` (server render, no DOM):

- `Nav` renders seven items in `PAGE_NAV` order.
- Pipeline items render as text containing "in the pipeline" and **no `<a>`**.
- Every non-pipeline `href` in `PAGE_NAV` resolves to a route (the existing
  "points at nothing that does not exist" test, extended to `/loramesh`).
- The rays `<img>` has empty `alt` and declared intrinsic size.
- `LANDING_NAV` and `PAGE_NAV` have the same labels in the same order, and the
  same pipeline flags; they differ only in the begin and about hrefs.
- No trace of the old horizontal bar class remains in the rendered nav.
- `NAV_NOSCRIPT_CSS` opens `.nav-rays[hidden]` (and no longer mentions `.nav-list`).

New `data/nav-rays_test.ts`:

- Seven entries; every tip lies inside the image box (0–100%).
- The declared intrinsic size matches the actual `.webp` dimensions, so a
  regenerated image with stale positions fails.

Manual: open and close in a browser at desktop and 360 px widths, both themes,
with and without JavaScript, and with reduced motion.

## Out of scope

- Building the messenger or lotto pages; they are listed, not linked.
- Animating individual rays (the Brooch's per-ray "breathing"). One static glow;
  can follow later.

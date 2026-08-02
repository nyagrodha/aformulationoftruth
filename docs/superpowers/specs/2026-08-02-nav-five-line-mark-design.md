# Nav: Five-Line Mark as Hamburger — Design

**Date:** 2026-08-02
**Status:** Built. Revised against the implementation and against CodeRabbit's
review of the first draft; sections marked *Resolved during build* record what
measurement changed.
**Branch:** `feat/nav-five-line-mark` (off `origin/production`)

## Goal

Rebuild the site nav around a new brand mark:

1. The **five-line mark** becomes the hamburger, top-left, and is the only menu trigger.
2. The **wordmark** moves top-right and demotes to a plain link home.
3. The open menu **projects left-to-right along the top** as a horizontal bar — not a vertical dropdown — translucent, and never sitting on the text below it.
4. Menu items become **begin · about · messaging · gift shop**.
5. The legacy `LogoMenu` is retired and all pages unify onto one nav.

## The mark

Five horizontal bars. The middle three carry cuts whose negative space forms the
Tamil numeral **௨** (இரண்டு, 2). Five lines, five energies; the glyph is the payload.

| Bar | Hex | Role |
|---|---|---|
| 1 | `#00B8F0` | cyan |
| 2 | `#2563EB` | blue |
| 3 | `#16A085` | teal |
| 4 | `#D7263D` | red |
| 5 | `#2B2D42` | dark navy |

Those are the **source** values, drawn against the dark card in the reference
artwork. Two of them do not survive the move to the site's paper ground and are
darkened before use — see *Colour* below.

## Findings that shaped this design

Recorded because several contradicted the obvious reading of the request.

| Assumption | Reality |
|---|---|
| A hamburger exists and needs restyling | There is **no hamburger**. `islands/Nav.tsx` makes the *wordmark itself* the disclosure toggle. Adding the mark changes the interaction model, not just the paint. |
| The nav is one component | **Two navs coexist.** `islands/Nav.tsx` (landing + `PageShell` prose pages) and `components/LogoMenu.tsx`, a `<details>` menu on `/profile-choice`, `/check-email`, `/profile-create`. |
| Menu links all resolve | `LogoMenu.tsx:13` links to **`/lotto.html`, which does not exist** — a live 404 on three routes today. |
| Nav items can be one shared list | `#begin` and `#about` are **fragments that exist only on the landing page** (`index.tsx:274`, `:378`). That is why `PAGE_NAV` uses routes and `LANDING_NAV` uses fragments. The `items` prop must stay. |
| The palette maps onto the wordmark | The wordmark has ~3 colour slots (`a`+`सत्य` share magenta, `4` blue, `முல` gold). Five colours map onto five *bars*, not onto four glyphs. |

## Architecture

### New component

```text
components/FiveLineMark.tsx    →  inline SVG, five <rect>, ௨ cut via <mask>
```

Inline SVG rather than `<img>` or a background image, for three reasons: the bars
read `--mark-*` off the cascade, so a caller on a different ground can restate the
five tokens without a second asset; it ships no client JS; and the ௨ mask stays in
the same file as the bars it cuts, so the two cannot drift apart.

Props: `class` (pass-through for sizing) and `id`. The component does not decide
its own size — callers do, the same way `WordmarkGlyphs` leaves its wrapper to the
caller. `id` exists because mask ids are document-global: two marks on one page
would collide and the second would render uncut.

### Nav restructure — `islands/Nav.tsx`

The island stays an island: open/closed is still client state, and the existing
justification in its header comment is unchanged.

What changes:

- The toggle's contents become `<FiveLineMark/>` instead of the wordmark, with
  `aria-label="Menu"` (the mark has no accessible text of its own).
- The wordmark moves out of the toggle into a sibling `<a href="/">` on the right.
  It is no longer a button, and no longer carries `aria-expanded`.
- `.nav-arrow` (the `▶` that rotated on open) is **removed**. The mark itself
  carries the open/closed state instead — see *Open state* below.
- The `items` prop, the Escape handler, the outside-click handler, the focus
  restore on Escape, and the `live` hydration guard all survive as-is.

The `live` guard keeps its current purpose: before hydration and forever without
JS, the toggle renders as a `<span>`, not a `<button>`, so nothing announces
`aria-expanded="false"` beside a list the `<noscript>` rule has already opened.

### Layout — `public/css/nav-mark.css`

`.nav-list` changes from `flex-direction: column` to `row` and spans the header's
full width.

Non-obstruction is handled by position, which varies with width — a fixed reserve
cannot work, because a wrapped bar's height is not known in advance:

- **Above 700px** the bar is a single row and stays `position: absolute`, so
  opening it does not reflow the header or shove the hero down the page. That was
  the original reason for absolute positioning and it is preserved deliberately.
  It is translucent (`color-mix` on `--paper`) with `backdrop-filter: blur()`, so
  the page reads through it and the links stay legible over whatever they cross.
- **Below 700px** it wraps to two or three rows and returns to normal flow with
  `flex-basis: 100%`, taking its own line and pushing content down. Overlap
  becomes impossible rather than merely tolerable.

The `flex-basis: 100%` is load-bearing: without it the list stays a flex sibling
of the mark and the wordmark and, being the widest of the three, shrinks the
wordmark to nothing.

### Colour

**There is no dark mode on this site.** No stylesheet carries a
`prefers-color-scheme` rule; the block at `prolegomenon.css:860` that looks like
one is the `footer` scope inverting to ink. The two panels in the reference
artwork are presentation, not a theme. An earlier draft of this spec assumed
otherwise and built a requirement on it; that requirement is withdrawn.

What is real is a contrast problem. Measured against `--paper` (`#e8ddc5`):

| token | source | on paper | verdict |
|---|---|---:|---|
| `--mark-1` | `#00B8F0` | **1.71:1** | fails |
| `--mark-2` | `#2563EB` | 3.83:1 | passes |
| `--mark-3` | `#16A085` | **2.43:1** | fails |
| `--mark-4` | `#D7263D` | 3.68:1 | passes |
| `--mark-5` | `#2B2D42` | 10.01:1 | passes |

WCAG SC 1.4.11 asks 3:1 of a non-text graphic. The cyan and the teal are well
under it — on cream the cyan is close to invisible. This is the *same* failure
`prolegomenon.css:97` already documents for the wordmark triad, from the same
cause: a palette drawn for a dark ground.

Resolved the same way: those two are darkened at constant hue and saturation
until they clear 3.5:1. The other three pass and are carried through untouched.

```css
--mark-1: #007ba1;  /* was #00B8F0 — 1.71:1 → 3.58:1 */
--mark-2: #2563eb;
--mark-3: #12816b;  /* was #16A085 — 2.43:1 → 3.56:1 */
--mark-4: #d7263d;
--mark-5: #2b2d42;
```

The mark never renders on the ink-backed footer, so unlike `--wm-*` there is no
inverted set. If it ever goes there, the source values are the ones to restore.

### Open state

With `.nav-arrow` gone, the mark communicates open/closed itself. The bars shift
horizontally on `aria-expanded="true"` — a small, purely CSS transform keyed off
the attribute, so it costs no JS and degrades to "no animation" without script.

### Retiring LogoMenu

`components/LogoMenu.tsx` is deleted. `/profile-choice`, `/check-email`, and
`/profile-create` import `Nav` instead and **reuse `PAGE_NAV`** rather than
declaring their own list — a per-route list is how `/lotto.html` would come back
by being re-typed. A test asserts `PAGE_NAV` contains neither `/lotto.html` nor
any bare fragment. This removes the 404 as a side effect.

### The `<noscript>` rule

The rule `.nav-list[hidden]{display:flex}.nav-arrow{display:none}` is currently
duplicated in `routes/index.tsx:136` and `components/PageShell.tsx:59`. It must
change anyway (`.nav-arrow` no longer exists), and unification would take it to
five copies. It is therefore extracted to a single shared constant imported by
every caller. This is in scope because the unification causes the duplication;
no unrelated refactoring is proposed.

`display: flex` still forces the list open correctly under the new row layout.

## Menu items

| Label | Landing (`LANDING_NAV`) | Prose pages (`PAGE_NAV`) |
|---|---|---|
| begin | `#begin` | `/#begin` |
| about | `#about` | `/about` |
| messaging | `/contact.html` | `/contact.html` |
| gift shop | `/shop` | `/shop` |

Both lists are **replaced entirely**, not extended. The current `LANDING_NAV`
labels (Introduction, Gate, Gift Shop, About) and `PAGE_NAV` labels (Home, About,
Contact, Gift Shop) give way to the four above. `Home` is dropped because the
wordmark now links home; `Contact` is dropped because `messaging` supersedes it.

`messaging` points at the existing contact page as a placeholder. It becomes a
real destination when the encrypted-messaging feature lands — see *Out of scope*.

## Accessibility

- The mark's toggle carries `aria-label="Menu"`, `aria-expanded`, `aria-controls="nav-list"`.
- Escape closes and returns focus to the toggle (existing behaviour, retained).
- Outside pointer-down closes (existing behaviour, retained).
- The wordmark link is reachable in tab order after the toggle.
- Bars are `aria-hidden` inside the SVG; the mark is decorative, the label carries meaning.
- Colour is never the sole carrier of meaning — the bars are ornament, not state
  indicators, and the open/closed state is announced via `aria-expanded`.

## Testing

`islands/Nav_test.tsx` is rewritten, not patched — the interaction model genuinely
changed. Nine tests, all passing:

- Every item renders with its `href`.
- The wordmark ships Tamil and Devanagari both, with per-segment colour classes.
- The wordmark link carries `aria-label="Home"` and hides its glyphs.
- The server render is inert: no `<button>`, no `aria-expanded`, no `aria-controls`.
- Empty `items` renders no `<li>`.
- The mark renders inside the toggle with all five bars and all five tokens.
- **The mask is *referenced* by bars 2–4**, and by neither bar 1 nor bar 5.
- `PAGE_NAV` contains no `/lotto.html` and no bare fragments.

The mask test earns its place: a `<mask>` that nothing points at is inert, so a
test asserting only that the mask *exists* would pass on a mark rendering five
unbroken bars with no glyph in it at all.

**Limitation, stated rather than papered over.** Escape-key focus restoration,
outside-`pointerdown` closing, and "the toggle becomes a `<button>` after
hydration" are **not** covered. `render()` from `preact-render-to-string` returns
a string — there is no DOM and no hydration — and the repo has no Playwright
config and no tracked e2e specs; the old `tests/e2e/*.spec.ts` were deleted in the
2026-08-02 merge. Covering those behaviours means standing up a browser harness,
which is its own piece of work and does not belong inside a nav redesign.

## Resolved during build

**Mark size — settled by measurement.** Rendered at a range of widths and judged
on the artefact: the ௨ needs roughly **110px of width** to read. Below about
80px the negative space collapses into texture and the mark is just five bars.
The stylesheet therefore floors it at `clamp(96px, 10vw, 124px)`, deliberately
larger than a conventional hamburger. The mark is ~1.15:1, near-square — not the
3:1 letterbox a row of bars first suggests.

**The glyph is a path, not text.** The outline is the real `two-tamil` glyph from
Noto Serif Tamil, extracted with fontTools and normalised. It is not `<text>`,
for two reasons: a webfont inside a mask is a runtime dependency, and the site's
own `SaiIndira.woff2` is a **legacy Latin-encoded face carrying no Tamil
codepoints at all** (0x20–0xFF, 226 glyphs). It could never have rendered ௨ —
and by the same token it is not rendering `Wordmark.tsx`'s Unicode `முல` either,
which is worth a separate look.

**The cut is a stroke, not a fill.** Filling the glyph punches its whole body out
and reads as three ragged holes. Stroking cuts only where the contour crosses a
bar, so the ௨ is implied by the alignment of thin slices — which is what makes it
negative space. Placement is constrained: ௨ carries two long horizontal strokes
near its foot, and wherever those land on a bar they erase most of its width.

## Out of scope

**Encrypted messaging** is a separate project with its own spec. In brief, so the
nav does not paint it into a corner:

- Phase 1: a visitor writes a message, it is encrypted to the site owner's PGP key
  and mailed out.
- Phase 2: profiles associate, and associated profiles exchange encrypted messages.

Two findings already relevant to that spec:

- `fresh_profiles` (006_profiles.sql) **already has `accepts_anonymous_mail`** and a
  `handle` column documented for `/p/<handle>` addressing. The seat is carved.
- It has **no public-key column**. That is the schema change phase 2 hinges on, so
  phase 1 must not hardcode "the owner's key" in a way that cannot generalise to
  "a recipient's key".
- The identity anchor is `email_hash`, never an email. Phase 2 delivery therefore
  cannot assume it knows anyone's address, which points toward in-site encrypted
  inboxes rather than mail-out.

Also unresolved there: whether encryption happens client-side (ships OpenPGP.js,
breaks the zero-JS stance on that page) or server-side (plaintext touches the
server). Different threat models; the user's call.

## Files touched

```text
components/FiveLineMark.tsx      new — inline SVG, ௨ cut via a referenced mask
components/nav-shared.ts         new — NAV_NOSCRIPT_CSS + PAGE_NAV
public/css/nav-mark.css          new — all nav layout and the --mark-* tokens
components/LogoMenu.tsx          deleted
islands/Nav.tsx                  restructured
islands/Nav_test.tsx             rewritten — 9 tests
components/PageShell.tsx         shared PAGE_NAV + noscript, links nav-mark.css
routes/index.tsx                 LANDING_NAV updated, links nav-mark.css
routes/profile-choice.tsx        LogoMenu → Nav
routes/check-email.tsx           LogoMenu → Nav
routes/profile-create.tsx        LogoMenu → Nav
components/Wordmark.tsx          unchanged (still used, now on the right)
public/css/prolegomenon.css      nav rules removed; dead responsive rule removed
```

### Why the CSS moved out of `prolegomenon.css`

The callers do not share a stylesheet. `routes/index.tsx` and `PageShell` load
`prolegomenon.css`; the three profile routes load `main.css`. Unifying them onto
one nav therefore meant either dragging the whole prolegomenon theme onto the
profile pages or maintaining the rules twice. `nav-mark.css` is the third option,
and every custom property in it carries a fallback because prolegomenon's `:root`
is absent on the `main.css` pages.

### Two regressions the build surfaced

Both from the same root cause — the wordmark becoming an `<a>` inside `.site-nav`
picks up rules written for menu links, which never reached it as a `<button>`.

1. `.site-nav a { text-transform: uppercase; font-family: Arial }` restyled the
   wordmark to `A4முலसत्यSYA`. Fixed with a qualified `.site-nav a.wordmark-home`
   override restoring `font: inherit` and `text-transform: none`.
2. `prolegomenon.css` carried `@media (width <= 900px) { .site-nav
   a:not(:first-child) { display: none } }` — written for a nav whose links were
   bare `<a>` children. It had long since stopped hiding links, and once the
   wordmark became an `<a>` it matched *that*, **deleting the wordmark on every
   viewport under 900px.** Rule removed.

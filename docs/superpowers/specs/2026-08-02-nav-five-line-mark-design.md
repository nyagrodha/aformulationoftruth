# Nav: Five-Line Mark as Hamburger — Design

**Date:** 2026-08-02
**Status:** Approved (design); implementation plan pending
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

Bar 5 is near-black and is the one at risk in dark mode — it needs a lightened
dark-theme value, not a straight reuse. See *Light and dark* below.

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

```
components/FiveLineMark.tsx    →  inline SVG, five <rect>, ௨ cut via <mask>
```

Inline SVG rather than `<img>` or a background image, for three reasons: the bars
inherit CSS custom properties so the existing light/dark switch drives them for
free; it ships no client JS; and the ௨ mask stays in the same file as the bars it
cuts, so the two cannot drift apart.

Props: `class` (pass-through for sizing) and nothing else. The component does not
decide its own size — callers do, the same way `WordmarkGlyphs` leaves its
wrapper to the caller.

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

### Layout — `public/css/prolegomenon.css`

`.nav-list` changes from `flex-direction: column` to `row`, spans the header's
full width, and keeps `position: absolute` so opening it still does not reflow the
header or shove the hero down the page — the existing decision documented at
`prolegomenon.css:184` is preserved deliberately.

Non-obstruction is handled in two layers, because the user asked for both:

1. **Translucency** — a semi-opaque background plus `backdrop-filter: blur()`,
   matching the treatment already on `.site-nav` in `site-nav.css`.
2. **Clearance** — the first content block below the header gets enough top
   spacing that an open bar never overlaps text. Translucency alone makes
   collisions *readable*; clearance makes them *not happen*.

Wrapping: with four items the bar fits comfortably. On narrow viewports the row
wraps rather than scrolls, so no item becomes unreachable.

### Colour variables

Five new custom properties beside the existing `--wm-*` triad at
`prolegomenon.css:104`:

```css
--mark-1: #00B8F0;  --mark-2: #2563EB;  --mark-3: #16A085;
--mark-4: #D7263D;  --mark-5: #2B2D42;
```

### Light and dark

`prolegomenon.css` already redefines `--wm-magenta/blue/gold` in a dark block at
line 860. The `--mark-*` set follows the same pattern in the same block — this is
exactly the seam the two panels of the source image imply.

`--mark-5` (`#2B2D42`) is the only bar that cannot survive unchanged: on a dark
ground it disappears. It gets a lightened dark-mode value. The other four are
saturated enough to hold on both grounds.

### Open state

With `.nav-arrow` gone, the mark communicates open/closed itself. The bars shift
horizontally on `aria-expanded="true"` — a small, purely CSS transform keyed off
the attribute, so it costs no JS and degrades to "no animation" without script.

### Retiring LogoMenu

`components/LogoMenu.tsx` is deleted. `/profile-choice`, `/check-email`, and
`/profile-create` import `Nav` instead, with their own `items` list. This removes
the `/lotto.html` 404 as a side effect.

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

`islands/Nav_test.tsx` currently has five tests asserting the wordmark-as-toggle
structure. They are rewritten, not patched — the interaction model genuinely
changed. Coverage to retain and extend:

- Toggle renders as `<span>` before hydration, `<button>` after.
- Toggle contains the mark and carries `aria-label`.
- Wordmark renders as an `<a href="/">`, not a button, and carries no `aria-expanded`.
- List renders `hidden` when closed, all items present when open.
- Empty `items` renders an empty list without crashing.
- New: the mark's SVG includes the ௨ mask (guards against the cut being lost).

## Open question

**Mark size.** At typical header size (~24–32px) the ௨ carved into the negative
space will be near-invisible. Resolution agreed: build it, screenshot at header
size with the existing Playwright setup, and judge the real artefact rather than a
mockup. If the glyph does not survive, scale the mark up in one follow-up pass.

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

```
components/FiveLineMark.tsx      new
components/Wordmark.tsx          unchanged (still used, now on the right)
components/LogoMenu.tsx          deleted
islands/Nav.tsx                  restructured
islands/Nav_test.tsx             rewritten
components/PageShell.tsx         noscript rule extracted; PAGE_NAV updated
routes/index.tsx                 noscript rule extracted; LANDING_NAV updated
routes/profile-choice.tsx        LogoMenu → Nav
routes/check-email.tsx           LogoMenu → Nav
routes/profile-create.tsx        LogoMenu → Nav
public/css/prolegomenon.css      --mark-* vars, row layout, translucency, clearance
```

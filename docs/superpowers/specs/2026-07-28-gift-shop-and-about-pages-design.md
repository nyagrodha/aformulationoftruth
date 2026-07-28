# Gift Shop + Two About-Linked Essay Pages — Design

**Date:** 2026-07-28
**Status:** Approved (design); implementation plan pending
**Branch:** `feat/gift-shop-and-about-pages` (off `origin/production`)

## Goal

Three things, in one push:

1. Stand up a **gift shop** at `/shop` — affiliate book links plus the QR wearables sold via Stripe.
2. Add two essay pages linked from the about page: **Victorian confession albums** and **contemporary respondents to the Proust Questionnaire**.
3. Promote the about page from a static file to a Fresh route, so the new child pages have a parent.

## Findings that shaped this design

Recorded because several contradicted prior assumptions.

| Assumption | Reality |
|---|---|
| Live site runs on the poet Pi | Runs on the **`fob` VPS**, `185.146.234.144`, Caddy-fronted. Poet Pi is offline and unrelated. |
| `routes/about.tsx` exists | It does not. About is `public/about.html`, linked as `/about.html` from 8 routes. |
| A store exists and needs finishing | Nothing exists. No shop code on any branch; `/shop` and `/store` both 404. It is net-new. |
| Site is strictly no-JS | The **questionnaire flow** is no-JS. Prose pages already ship JS (`copyZcashAddress()`, `theme-toggle.js`). |
| `origin/production` matches the server | Server is **1 commit ahead and unpushed** (`ad8e3614`), with a dirty working tree. |

Two content corrections:

- The Penguin Classics Deluxe edition is titled **_In Search of Lost Time_**, not _Remembrance of Things Past_. The latter is the older Moncrieff title (Modern Library / Vintage, 3 vols) — a different translation.
- That set is **7 volumes, not 6**. Volumes 5–7 appeared late (2019, 2021) because the Prendergast-edited translation was blocked in the US by copyright until those rights cleared.

## Architecture

### Routing

```
routes/about.tsx                     →  /about                      (port of public/about.html)
routes/about/confession-albums.tsx   →  /about/confession-albums
routes/about/respondents.tsx         →  /about/respondents
routes/shop.tsx                      →  /shop
```

`routes/about.tsx` and a `routes/about/` directory coexist in Fresh — the file matches the exact path, the directory matches children.

**The `/about.html` problem.** Fresh serves `public/` verbatim, so leaving the file in place would keep a stale duplicate live at `/about.html`. Resolution:

1. Delete `public/about.html`.
2. Add a **301** in the Caddyfile: `/about.html` → `/about`. Preserves external links and bookmarks.
3. Update the 8 in-repo links (`login`, `index` ×2, `profile-choice`, `questionnaire`, `check-email`, `profile-create`, `completion`, `gate`).

**Fresh 1.7.3 requires `fresh.gen.ts` to be regenerated when routes are added** — running `dev.ts` once rebuilds the manifest. Adding a route is therefore not a hot edit; it needs a manifest rebuild plus `systemctl restart aformulationoftruth-fresh`.

### Shared layout

The existing 8 routes each hand-duplicate footer markup. Extract `components/PageShell.tsx` — head, theme toggle, footer, ornament divider — and use it for **the 4 new pages only**. Refactoring the existing 8 to use it is explicitly out of scope; it is a separate change with its own regression risk.

Design vocabulary to match, taken from `about.html`:

- `madras-theme.css`; themes Tamas / Nīla / Uruvam via `theme-toggle.js`
- Tamil buttons: திரும்பவும் ("return"), தொடங்கு ("begin")
- Sanskrit/Tamil section headers in the existing register (*vividhā racanā*, அகம்)
- Filigree SVG ornament as section divider
- Classes: `.about-container`, `.about-content`, `.lead`, `.ornament`, `.btn.btn-primary`

### Shop data model

Catalog lives in `data/shop.ts` so it is editable without touching markup:

```ts
export type ShopItem =
  | {
      kind: "affiliate";
      title: string;
      author: string;
      translator?: string;
      isbn: string;
      volume?: number;
      blurb: string;
      links: { retailer: string; url: string }[];
    }
  | {
      kind: "own";
      title: string;
      blurb: string;
      price: string;
      paymentLink: string; // Stripe Payment Link URL
    };
```

`links` is an **array, not named fields** (`amazonUrl` / `penguinUrl`). This is what makes "let them choose" cheap: adding Bookshop.org later is one entry per item and zero template changes, and a title available from only one retailer renders with no conditional branching.

### Affiliate links

Both retailers per book, rendered inline beneath each title as `Penguin · Amazon` — not as buttons, so a 7-volume list does not become 14 buttons. **Penguin first**, Amazon second; order signals preference and leading with the publisher fits the site.

Accepted trade-off: two equal-weight choices measurably split and reduce affiliate conversion versus a single call-to-action. This is a deliberate cost paid for reader autonomy.

Status of the two programs:

- **Amazon Associates — account exists.** Tag appended as `?tag=<TAG>` (or `&tag=` where the URL already has a query string).
- **Penguin Random House / ShareASale — not yet registered.** Build with links to `penguinrandomhouse.com` product pages and a single interpolation point for the affiliate ID, so registering later is a one-line change. Until registered, PRH links are plain non-affiliate links — which is correct and honest, not broken.

Useful simplification: de Botton's *How Proust Can Change Your Life* is published by **Vintage, a PRH imprint**, and sells on penguinrandomhouse.com. One PRH account therefore covers all eight titles.

### Payments — Stripe Payment Links

Use **Stripe Payment Links**, which are hosted Stripe Checkout without server-side session creation. Each is a plain `<a href="https://buy.stripe.com/...">`.

Chosen over full API Checkout because it means: no Stripe SDK, no API keys on the VPS, no secret rotation, no JS, and no PCI scope. Product, price, shipping-address collection and tax are configured in the Stripe dashboard.

Trade-off accepted: no dynamic pricing and no live inventory count, and product configuration lives in Stripe rather than in git. Appropriate for a small run of wearables.

### Legal

FTC requires **conspicuous** affiliate disclosure — placed at the top of `/shop`, above the catalog, not in the footer. Non-optional.

## Catalog

### Penguin Classics Deluxe — *In Search of Lost Time* (Christopher Prendergast, gen. ed.)

| Vol | Title | Translator | ISBN |
|---|---|---|---|
| 1 | Swann's Way | Lydia Davis | 9780142437964 |
| 2 | In the Shadow of Young Girls in Flower | James Grieve | 9780143039075 |
| 3 | The Guermantes Way | Mark Treharne | 9780143039228 |
| 4 | Sodom and Gomorrah | John Sturrock | 9780143039310 |
| 5 | The Prisoner | Carol Clark | 9780143133599 |
| 6 | The Fugitive | Peter Collier | 9780143133704 |
| 7 | Finding Time Again | Ian Patterson | 9780143133711 |

### Also

| Title | Author | Publisher | ISBN |
|---|---|---|---|
| How Proust Can Change Your Life | Alain de Botton | Vintage (PRH) | 9780679779155 |

### Own items

QR wearables from the wearable-encounters work — brooches/badges carrying a token that opens the questionnaire via `/w/:token`. Sold via Stripe Payment Link.

**Open:** exact product description, price, and Payment Link URL. Placeholder in `data/shop.ts` until supplied; the item renders behind a flag so the page ships without it.

## Essay page content

Both pages are prose in the register of `about.html` — essayistic, not listicle.

### `/about/confession-albums`

Beats to cover:

- Confession albums as a Victorian parlour pastime, descended from the *album amicorum* / friendship album; printed volumes with pre-printed prompts circulated among friends, 1860s–1890s.
- **Proust did not invent the questionnaire.** He answered an existing one — once around age 13 in Antoinette Faure's album, and again around 20. The attribution is retrospective; the form predates him.
- The 1890 manuscript resurfaced and was auctioned in 2003, which is much of why his name attached to the form.
- Relation to adjacent forms: birthday books, autograph albums, friendship books.
- Tie back to the site's own framing: the questionnaire as a sequence of invitations rather than a test.

### `/about/respondents`

Beats to cover:

- **Bernard Pivot** — *Apostrophes* (1975–90) and *Bouillon de Culture*; his own condensed variant closing each interview.
- **James Lipton, *Inside the Actors Studio*** — adopted Pivot's variant, which is how most English-speaking audiences met the form.
- ***Vanity Fair*** back page, from 1993 onward — the long-running Proust Questionnaire feature.

**Research required at implementation.** Specific respondents, dates, and quotations must be verified before publication rather than written from memory. Do not ship unverified attributions to named living people.

## Testing

- `deno task test` passes.
- Manual: each of the 4 new routes returns 200; `/about.html` 301s to `/about`; all 8 updated in-repo links resolve.
- Every affiliate URL resolves to the correct title (ISBN match), not a search page or 404.
- Theme toggle works on all new pages across Tamas / Nīla / Uruvam.
- No layout break at mobile width.

## Deployment hazards

1. **The server has an unpushed commit `ad8e3614` and a dirty working tree with many staged deletions.** Push or preserve it before deploying. Do not `git reset --hard` or force-pull.
2. Adding routes requires a `fresh.gen.ts` rebuild **and** `systemctl restart aformulationoftruth-fresh`, not just a file copy.
3. The Caddyfile change needs a Caddy reload, separate from the app restart.
4. There are two hosts named `fobdongle` — this VPS and the LoRa Pi at `192.168.1.20`. Deploy target is `ssh fob`.

## Out of scope

- Refactoring the existing 8 routes onto `PageShell`.
- Cart, inventory, or order management.
- Migrating the other `public/*.html` prose pages to routes.
- Registering the PRH/ShareASale account (user action).

## Open questions

- [ ] Amazon Associates tag value
- [ ] Stripe Payment Link URL, price, and product description for the wearable
- [ ] Whether to add Bookshop.org as a third retailer later

# Gift Shop + About Route + Essay Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `/shop` (8 affiliate books + 2 Stripe-backed tees), promote the about page from a static file to `/about`, and add two essay pages beneath it.

**Architecture:** Four new Fresh routes rendering full HTML documents, sharing one `PageShell` component. Shop catalog lives in a single typed data module so items are added as array entries, never markup edits. Affiliate URLs are built by a pure function with one interpolation point for the Amazon tag.

**Tech Stack:** Deno, Fresh 1.7.3, Preact, `$std/assert` for tests, Caddy for the redirect.

**Spec:** `docs/superpowers/specs/2026-07-28-gift-shop-and-about-pages-design.md`

## Global Constraints

- Branch: `feat/gift-shop-and-about-pages`. Never commit to `production` directly.
- **`.gitignore:115` is a blanket `*.md`.** Every markdown file must be added with `git add -f` or it is silently dropped.
- Routes render **complete `<html>` documents**. There is no `_app.tsx` or `_layout.tsx` in this project — do not create one.
- Preact JSX here uses **`class=`**, not `className=`. Match surrounding code.
- The four new pages use **`/css/madras-theme.css`** (matching `about.html`), NOT `/css/main.css` (the neon theme the questionnaire routes use). Both stylesheets coexist deliberately.
- `fresh.gen.ts` is checked into version control and must be regenerated when routes are added.
- Amazon Associates tag is **not yet available**. Use the constant `AMAZON_TAG` in `data/shop.ts` with value `""`; `buildAmazonUrl` must return an un-tagged but valid URL when it is empty.
- Prices are `tax_behavior: inclusive` — **display $35 as the final price**. Never render "plus tax".
- Do not invent respondent names, dates, or quotations. Task 6 covers this explicitly.

---

### Task 1: Shop catalog data module

**Files:**

- Create: `data/shop.ts`
- Test: `data/shop_test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type ShopItem`, `type RetailerLink`, `const AMAZON_TAG: string`, `buildAmazonUrl(isbn: string): string`, `buildPenguinUrl(isbn: string): string`, `const BOOKS: ShopItem[]`, `const OWN_ITEMS: ShopItem[]`, `const SHOP_ITEMS: ShopItem[]`.

- [ ] **Step 1: Write the failing test**

Create `data/shop_test.ts`:

```ts
import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { AMAZON_TAG, BOOKS, buildAmazonUrl, buildPenguinUrl, OWN_ITEMS, SHOP_ITEMS } from './shop.ts';

Deno.test('buildAmazonUrl omits the tag parameter when AMAZON_TAG is empty', () => {
  assertEquals(AMAZON_TAG, '');
  assertEquals(buildAmazonUrl('9780142437964'), 'https://www.amazon.com/dp/9780142437964');
});

Deno.test('buildPenguinUrl points at the PRH ISBN lookup', () => {
  assertStringIncludes(buildPenguinUrl('9780142437964'), '9780142437964');
  assertStringIncludes(buildPenguinUrl('9780142437964'), 'penguinrandomhouse.com');
});

Deno.test('catalog contains all seven Proust volumes plus de Botton', () => {
  assertEquals(BOOKS.length, 8);
  const volumes = BOOKS.filter((b) => b.kind === 'affiliate' && b.volume !== undefined);
  assertEquals(volumes.length, 7);
});

Deno.test('every book offers Penguin first and Amazon second', () => {
  for (const book of BOOKS) {
    if (book.kind !== 'affiliate') continue;
    assertEquals(book.links[0].retailer, 'Penguin');
    assertEquals(book.links[1].retailer, 'Amazon');
  }
});

Deno.test('own items carry live Stripe Payment Links', () => {
  assertEquals(OWN_ITEMS.length, 2);
  for (const item of OWN_ITEMS) {
    if (item.kind !== 'own') continue;
    assertStringIncludes(item.paymentLink, 'https://buy.stripe.com/');
    assertEquals(item.price, '$35');
  }
});

Deno.test('SHOP_ITEMS is books followed by own items', () => {
  assertEquals(SHOP_ITEMS.length, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-env --allow-read data/shop_test.ts`
Expected: FAIL — `Module not found "./shop.ts"`.

- [ ] **Step 3: Write the implementation**

Create `data/shop.ts`:

```ts
/**
 * Gift shop catalog.
 *
 * Adding an item is an array entry here — never a markup edit in routes/shop.tsx.
 * `links` is an array (not named amazonUrl/penguinUrl fields) so a third
 * retailer is one entry per book with zero template changes.
 */

export type RetailerLink = {
  retailer: string;
  url: string;
};

export type ShopItem =
  | {
    kind: 'affiliate';
    title: string;
    author: string;
    translator?: string;
    isbn: string;
    volume?: number;
    blurb: string;
    links: RetailerLink[];
  }
  | {
    kind: 'own';
    title: string;
    blurb: string;
    price: string;
    paymentLink: string;
  };

/**
 * Amazon Associates tag. Empty until the account tag is supplied; an empty
 * value yields a valid, un-tagged Amazon URL rather than a broken one.
 */
export const AMAZON_TAG = '';

export function buildAmazonUrl(isbn: string): string {
  const base = `https://www.amazon.com/dp/${isbn}`;
  return AMAZON_TAG ? `${base}?tag=${AMAZON_TAG}` : base;
}

/**
 * PRH/ShareASale is not registered yet, so these are plain publisher links.
 * When the affiliate ID arrives, append it here — one place, all eight books.
 */
export function buildPenguinUrl(isbn: string): string {
  return `https://www.penguinrandomhouse.com/search/site?q=${isbn}`;
}

function book(
  title: string,
  isbn: string,
  blurb: string,
  opts: { author?: string; translator?: string; volume?: number } = {},
): ShopItem {
  return {
    kind: 'affiliate',
    title,
    author: opts.author ?? 'Marcel Proust',
    translator: opts.translator,
    isbn,
    volume: opts.volume,
    blurb,
    links: [
      { retailer: 'Penguin', url: buildPenguinUrl(isbn) },
      { retailer: 'Amazon', url: buildAmazonUrl(isbn) },
    ],
  };
}

export const BOOKS: ShopItem[] = [
  book(
    'Swann’s Way',
    '9780142437964',
    'Where it begins: the madeleine, Combray, and the long descent into involuntary memory.',
    { translator: 'Lydia Davis', volume: 1 },
  ),
  book(
    'In the Shadow of Young Girls in Flower',
    '9780143039075',
    'Balbec, the sea, and the first serious education of desire.',
    { translator: 'James Grieve', volume: 2 },
  ),
  book(
    'The Guermantes Way',
    '9780143039228',
    'The salon as a machine for sorting people; the narrator learns its grammar.',
    { translator: 'Mark Treharne', volume: 3 },
  ),
  book('Sodom and Gomorrah', '9780143039310', 'The novel turns and looks directly at what it had been circling.', {
    translator: 'John Sturrock',
    volume: 4,
  }),
  book(
    'The Prisoner',
    '9780143133599',
    'Love as surveillance. The most claustrophobic volume, and the most honest about jealousy.',
    { translator: 'Carol Clark', volume: 5 },
  ),
  book('The Fugitive', '9780143133704', 'Absence does its work. Grief arrives late and out of order.', {
    translator: 'Peter Collier',
    volume: 6,
  }),
  book('Finding Time Again', '9780143133711', 'The recognition scene the whole sequence was built toward.', {
    translator: 'Ian Patterson',
    volume: 7,
  }),
  book(
    'How Proust Can Change Your Life',
    '9780679779155',
    'De Botton reads Proust as a practical guide — unserious in tone, serious in effect.',
    { author: 'Alain de Botton' },
  ),
];

export const OWN_ITEMS: ShopItem[] = [
  {
    kind: 'own',
    title: 'Abhinava-Tee',
    blurb: 'Devotional-intellectual streetwear: part philosopher icon, part tantric diagram, part literary homage.',
    price: '$35',
    paymentLink: 'https://buy.stripe.com/4gM5kD2iS77L0p67K53ZK00',
  },
  {
    kind: 'own',
    title: 'Abhinavabsurd… yet funny!',
    blurb: 'Abhinavagupta in luminous neon, framed by a radiant mandala. Part tantra, part tech satire.',
    price: '$35',
    paymentLink: 'https://buy.stripe.com/bJeaEX8Hg63H5Jqe8t3ZK01',
  },
];

export const SHOP_ITEMS: ShopItem[] = [...BOOKS, ...OWN_ITEMS];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-env --allow-read data/shop_test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add data/shop.ts data/shop_test.ts
git commit -m "feat(shop): typed catalog with per-book Penguin and Amazon links"
```

---

### Task 2: PageShell component

**Files:**

- Create: `components/PageShell.tsx`
- Test: `components/PageShell_test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `PageShell(props: { title: string; description: string; children: preact.ComponentChildren }): JSX.Element` and `Ornament(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `components/PageShell_test.tsx`:

```tsx
import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { Ornament, PageShell } from './PageShell.tsx';

Deno.test('PageShell renders a full document with the madras theme', () => {
  const html = render(
    <PageShell title='Test Title' description='Test description'>
      <p>body content</p>
    </PageShell>,
  );
  assertStringIncludes(html, '<title>Test Title</title>');
  assertStringIncludes(html, 'Test description');
  assertStringIncludes(html, '/css/madras-theme.css');
  assertStringIncludes(html, 'body content');
});

Deno.test('PageShell footer links to about, contact and privacy', () => {
  const html = render(
    <PageShell title='t' description='d'>
      <span />
    </PageShell>,
  );
  assertStringIncludes(html, 'href="/about"');
  assertStringIncludes(html, 'href="/contact.html"');
  assertStringIncludes(html, 'href="/privacy.html"');
});

Deno.test('Ornament renders an aria-hidden svg divider', () => {
  const html = render(<Ornament />);
  assertStringIncludes(html, 'aria-hidden="true"');
  assertStringIncludes(html, '<svg');
});
```

- [ ] **Step 2: Add the render dependency and run the test**

Add to `deno.json` `imports`:

```json
"preact-render-to-string": "https://esm.sh/preact-render-to-string@6.5.11?external=preact"
```

Run: `deno test --allow-env --allow-read --allow-net components/PageShell_test.tsx`
Expected: FAIL — `Module not found "./PageShell.tsx"`.

- [ ] **Step 3: Write the implementation**

Create `components/PageShell.tsx`:

```tsx
import type { ComponentChildren } from 'preact';

/** Filigree divider matching the one in the original about.html. */
export function Ornament() {
  return (
    <div class='ornament' aria-hidden='true'>
      <svg viewBox='0 0 120 14' xmlns='http://www.w3.org/2000/svg' role='img' aria-hidden='true'>
        <path
          d='M6 7 C24 1, 36 13, 54 7 C72 1, 84 13, 102 7'
          stroke-linecap='round'
          stroke-linejoin='round'
        />
        <circle cx='20' cy='7' r='1.2' />
        <circle cx='100' cy='7' r='1.2' />
      </svg>
    </div>
  );
}

/**
 * Full-document shell for the madras-themed prose pages.
 *
 * Deliberately scoped to the four new pages. The existing questionnaire
 * routes use /css/main.css and hand-rolled footers; converting them is a
 * separate change with its own regression risk.
 */
export function PageShell(
  { title, description, children }: {
    title: string;
    description: string;
    children: ComponentChildren;
  },
) {
  return (
    <html lang='en'>
      <head>
        <meta charset='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>{title}</title>
        <meta name='description' content={description} />
        <link rel='stylesheet' href='/css/madras-theme.css' />
      </head>
      <body>
        <div class='theme-toggle'>
          <button class='theme-btn active' data-theme='tamas' aria-label='Tamas theme'>Tamas</button>
          <button class='theme-btn' data-theme='nila' aria-label='Nīla theme'>Nīla</button>
          <button class='theme-btn' data-theme='uruvam' aria-label='Uruvam theme'>Uruvam</button>
        </div>

        <div class='about-container'>
          {children}

          <div style='text-align: center;'>
            <a href='/' class='btn btn-primary back-link'>திரும்பவும்</a>
            <a href='/questionnaire' class='btn btn-secondary back-link' style='margin-left: 1rem;'>
              தொடங்கு
            </a>
          </div>
        </div>

        <footer>
          <div class='footer-inner'>
            <div class='footer-links'>
              <a href='/about'>About</a>
              <a href='/contact.html'>Contact</a>
              <a href='/privacy.html'>Privacy</a>
            </div>
          </div>
        </footer>

        <script src='/js/theme-toggle.js'></script>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-env --allow-read --allow-net components/PageShell_test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/PageShell.tsx components/PageShell_test.tsx deno.json
git commit -m "feat(ui): PageShell for madras-themed prose pages"
```

---

### Task 3: The /shop route

**Files:**

- Create: `routes/shop.tsx`
- Test: `routes/shop_test.tsx`

**Interfaces:**

- Consumes: `SHOP_ITEMS`, `BOOKS`, `OWN_ITEMS`, `ShopItem` from `data/shop.ts`; `PageShell`, `Ornament` from `components/PageShell.tsx`.
- Produces: default-exported `ShopPage()`.

- [ ] **Step 1: Write the failing test**

Create `routes/shop_test.tsx`:

```tsx
import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ShopPage from './shop.tsx';

Deno.test('shop page carries a conspicuous affiliate disclosure', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'affiliate');
});

Deno.test('shop page lists every Proust volume and de Botton', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'Swann');
  assertStringIncludes(html, 'Finding Time Again');
  assertStringIncludes(html, 'How Proust Can Change Your Life');
});

Deno.test('each book offers both retailers', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'penguinrandomhouse.com');
  assertStringIncludes(html, 'amazon.com');
});

Deno.test('tees link to Stripe and show the inclusive price', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'https://buy.stripe.com/');
  assertStringIncludes(html, '$35');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-env --allow-read --allow-net routes/shop_test.tsx`
Expected: FAIL — `Module not found "./shop.tsx"`.

- [ ] **Step 3: Write the implementation**

Create `routes/shop.tsx`:

```tsx
/**
 * Gift Shop — GET /shop
 *
 * Books are outbound affiliate links (two retailers, reader chooses).
 * Tees are Stripe Payment Links; prices are tax-inclusive, so the figure
 * shown is the final figure paid.
 */
import { Ornament, PageShell } from '../components/PageShell.tsx';
import { BOOKS, OWN_ITEMS, type ShopItem } from '../data/shop.ts';

function BookEntry({ item }: { item: ShopItem }) {
  if (item.kind !== 'affiliate') return null;
  return (
    <div class='shop-item'>
      <h3>
        {item.volume !== undefined ? `${item.volume}. ` : ''}
        {item.title}
      </h3>
      <p class='shop-meta'>
        {item.author}
        {item.translator ? ` · translated by ${item.translator}` : ''}
      </p>
      <p>{item.blurb}</p>
      <p class='shop-links'>
        {item.links.map((link, i) => (
          <span key={link.retailer}>
            {i > 0 ? ' · ' : ''}
            <a href={link.url} target='_blank' rel='noopener sponsored'>{link.retailer}</a>
          </span>
        ))}
      </p>
    </div>
  );
}

function OwnEntry({ item }: { item: ShopItem }) {
  if (item.kind !== 'own') return null;
  return (
    <div class='shop-item'>
      <h3>{item.title}</h3>
      <p>{item.blurb}</p>
      <p class='shop-meta'>{item.price} — price includes tax</p>
      <p class='shop-links'>
        <a href={item.paymentLink} class='btn btn-primary' target='_blank' rel='noopener'>
          Buy
        </a>
      </p>
    </div>
  );
}

export default function ShopPage() {
  return (
    <PageShell
      title='the gift shop — a formulation of truth'
      description='Books that shaped the questionnaire, and a few things to wear.'
    >
      <div class='about-header'>
        <h1>the gift shop</h1>
        <p style='color: var(--text-secondary);'>what to read, and what to wear while reading it</p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          Some of these are books. Some are shirts. All of them are here because they belong to the same preoccupation.
        </p>

        <p class='shop-disclosure'>
          <strong>Disclosure:</strong>{' '}
          book links are affiliate links. If you buy through them, this site earns a small commission at no additional
          cost to you. Both retailers are offered for every title so you can choose; neither is preferred on your
          behalf.
        </p>

        <Ornament />

        <h2>In Search of Lost Time</h2>

        <p>
          The Penguin Classics Deluxe edition, under Christopher Prendergast’s general editorship — a different
          translation from the Moncrieff{' '}
          <em>
            Remembrance of Things Past
          </em>{' '}
          many people met first. Seven volumes, each with its own translator, the last three of which reached American
          readers only recently.
        </p>

        {BOOKS.filter((b) => b.kind === 'affiliate' && b.volume !== undefined).map((item) => (
          <BookEntry key={item.title} item={item} />
        ))}

        <Ornament />

        <h2>On Proust</h2>

        {BOOKS.filter((b) => b.kind === 'affiliate' && b.volume === undefined).map((item) => (
          <BookEntry key={item.title} item={item} />
        ))}

        <Ornament />

        <h2 class='subtle'>to wear</h2>

        {OWN_ITEMS.map((item) => <OwnEntry key={item.title} item={item} />)}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-env --allow-read --allow-net routes/shop_test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add routes/shop.tsx routes/shop_test.tsx
git commit -m "feat(shop): /shop route with affiliate books and Stripe tees"
```

---

### Task 4: Promote about to a route

**Files:**

- Create: `routes/about.tsx`
- Delete: `public/about.html`
- Modify: `routes/login.tsx`, `routes/index.tsx`, `routes/profile-choice.tsx`, `routes/questionnaire.tsx`, `routes/check-email.tsx`, `routes/profile-create.tsx`, `routes/completion.tsx`, `routes/gate.tsx`
- Modify: `Caddyfile`
- Test: `routes/about_test.tsx`

**Interfaces:**

- Consumes: `PageShell`, `Ornament`.
- Produces: default-exported `AboutPage()`.

- [ ] **Step 1: Write the failing test**

Create `routes/about_test.tsx`:

```tsx
import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import AboutPage from './about.tsx';

Deno.test('about page preserves its original copy', () => {
  const html = render(<AboutPage />);
  assertStringIncludes(html, 'You are not one self');
  assertStringIncludes(html, 'Find who sleeps');
  assertStringIncludes(html, 'vividh');
});

Deno.test('about page links to both new essay pages', () => {
  const html = render(<AboutPage />);
  assertStringIncludes(html, '/about/confession-albums');
  assertStringIncludes(html, '/about/respondents');
});

Deno.test('about page links to the shop', () => {
  assertStringIncludes(render(<AboutPage />), '/shop');
});

Deno.test('the static about.html is gone', async () => {
  let existed = true;
  try {
    await Deno.stat('./public/about.html');
  } catch {
    existed = false;
  }
  assertEquals(existed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-env --allow-read --allow-net routes/about_test.tsx`
Expected: FAIL — `Module not found "./about.tsx"`.

- [ ] **Step 3: Write the route**

Create `routes/about.tsx`, porting the body of `public/about.html` verbatim into `PageShell`. Copy the four opening paragraphs, both `<h2>` sections, and the Zcash support block exactly as they stand — this is a port, not a rewrite. Then add the new links section shown below immediately before the closing `</div>` of `about-content`:

```tsx
        <Ornament />

        <h2 class='subtle'>further</h2>

        <ul class='about-links'>
          <li>
            <a href='/about/confession-albums'>More on Victorian confession albums</a>
            {' '}— where the questionnaire actually comes from.
          </li>
          <li>
            <a href='/about/respondents'>Contemporary figures who have responded</a>
            {' '}— the form’s afterlife, from Pivot to the present.
          </li>
          <li>
            <a href='/shop'>The gift shop</a>
            {' '}— the books themselves, and a few things to wear.
          </li>
        </ul>
```

Keep the Zcash copy button working: move the inline `copyZcashAddress()` script into `public/js/zcash-copy.js` and reference it with `<script src='/js/zcash-copy.js'></script>`, since inline handlers are awkward inside JSX.

- [ ] **Step 4: Delete the static page and update every inbound link**

```bash
git rm public/about.html
grep -rn '/about\.html' routes/ islands/
```

Replace every `href="/about.html"` and `href='/about.html'` with `/about` in the 8 route files listed above. Re-run the grep and confirm zero hits in `routes/` and `islands/`.

- [ ] **Step 5: Add the Caddy redirect**

In `Caddyfile`, inside the `aformulationoftruth.com` site block, above the reverse proxy:

```
redir /about.html /about 301
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `deno test --allow-env --allow-read --allow-net routes/about_test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add routes/about.tsx routes/about_test.tsx Caddyfile public/js/zcash-copy.js
git add -u routes/
git commit -m "feat(about): promote about to /about route, 301 the old .html"
```

---

### Task 5: Victorian confession albums essay

**Files:**

- Create: `routes/about/confession-albums.tsx`
- Test: `routes/about/confession-albums_test.tsx`

**Interfaces:**

- Consumes: `PageShell`, `Ornament` from `../../components/PageShell.tsx`.
- Produces: default-exported `ConfessionAlbumsPage()`.

- [ ] **Step 1: Write the failing test**

Create `routes/about/confession-albums_test.tsx`:

```tsx
import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ConfessionAlbumsPage from './confession-albums.tsx';

Deno.test('page states plainly that Proust did not invent the form', () => {
  const html = render(<ConfessionAlbumsPage />);
  assertStringIncludes(html, 'did not invent');
});

Deno.test('page covers the album amicorum lineage', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'album amicorum');
});

Deno.test('page links back to about', () => {
  assertStringIncludes(render(<ConfessionAlbumsPage />), 'href="/about"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-env --allow-read --allow-net routes/about/confession-albums_test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the essay**

Create `routes/about/confession-albums.tsx` using `PageShell` with title
`'Victorian confession albums — a formulation of truth'`.

Cover, in the register of `about.html` (essayistic, lowercase headers, `Ornament` between sections):

1. The confession album as a parlour pastime of the 1860s–1890s, descended from the _album amicorum_ — the friendship album passed between acquaintances for inscription.
2. Printed volumes with pre-printed prompts, circulated among friends and family, the answers accumulating as a group portrait.
3. **Proust did not invent the questionnaire.** He answered an existing one — once as an adolescent in Antoinette Faure's album, and again as a young man. The attribution is retrospective; the form predates him and he was one respondent among many.
4. The resurfacing and 2003 auction of the manuscript, which is much of why his name attached to a form he merely filled in.
5. Adjacent forms: birthday books, autograph albums, friendship books.
6. A closing turn back to this site: the questionnaire as a sequence of invitations rather than a test — the same thing the album was doing.

Verify each factual claim before writing it. Where a specific date or name cannot be confirmed, write around it rather than guessing.

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-env --allow-read --allow-net routes/about/confession-albums_test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add routes/about/confession-albums.tsx routes/about/confession-albums_test.tsx
git commit -m "feat(about): essay on Victorian confession albums"
```

---

### Task 6: Contemporary respondents essay

**Files:**

- Create: `routes/about/respondents.tsx`
- Test: `routes/about/respondents_test.tsx`

**Interfaces:**

- Consumes: `PageShell`, `Ornament` from `../../components/PageShell.tsx`.
- Produces: default-exported `RespondentsPage()`.

**⚠️ Accuracy gate for this task.** This page describes real, mostly living people. Every name, date, and quotation must be verified against a source before it is written. Do not reproduce a respondent's answers from memory. If a claim cannot be verified, omit it — an essay about the form's lineage works without an exhaustive roll-call, and a fabricated attribution to a living person is a genuine harm, not a cosmetic error.

- [ ] **Step 1: Write the failing test**

Create `routes/about/respondents_test.tsx`:

```tsx
import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import RespondentsPage from './respondents.tsx';

Deno.test('page covers Pivot as the modern transmitter of the form', () => {
  assertStringIncludes(render(<RespondentsPage />), 'Pivot');
});

Deno.test('page covers the Vanity Fair back page', () => {
  assertStringIncludes(render(<RespondentsPage />), 'Vanity Fair');
});

Deno.test('page links back to about', () => {
  assertStringIncludes(render(<RespondentsPage />), 'href="/about"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-env --allow-read --allow-net routes/about/respondents_test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Research, then write**

Verify before writing:

- Bernard Pivot's _Apostrophes_ (1975–1990) and _Bouillon de Culture_, and his own condensed closing questionnaire.
- James Lipton's use of Pivot's variant on _Inside the Actors Studio_ — the route by which most English-speaking audiences met the form.
- _Vanity Fair_'s back-page Proust Questionnaire, running from 1993.

Then write `routes/about/respondents.tsx` with `PageShell`, title
`'Who has answered — a formulation of truth'`, tracing the line from parlour album to broadcast to magazine feature, and closing on what changes when the form is answered publicly by a famous person rather than privately among friends — which is the question this site is actually interested in.

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-env --allow-read --allow-net routes/about/respondents_test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add routes/about/respondents.tsx routes/about/respondents_test.tsx
git commit -m "feat(about): essay on contemporary respondents"
```

---

### Task 7: Regenerate the manifest and verify the whole suite

**Files:**

- Modify: `fresh.gen.ts`

**Interfaces:**

- Consumes: all four new route modules.
- Produces: a manifest registering `/about`, `/about/confession-albums`, `/about/respondents`, `/shop`.

- [ ] **Step 1: Regenerate the manifest**

Run `deno task dev`, wait for it to print that it has written `fresh.gen.ts`, then stop it with Ctrl-C. Fresh rewrites the manifest on startup.

If `dev` cannot start (it needs a database connection), hand-edit `fresh.gen.ts` instead — it is mechanical. Add the imports in alphabetical position:

```ts
import * as $about from './routes/about.tsx';
import * as $about_confession_albums from './routes/about/confession-albums.tsx';
import * as $about_respondents from './routes/about/respondents.tsx';
import * as $shop from './routes/shop.tsx';
```

and the matching entries in the `routes` object:

```ts
'./routes/about.tsx': $about,
'./routes/about/confession-albums.tsx': $about_confession_albums,
'./routes/about/respondents.tsx': $about_respondents,
'./routes/shop.tsx': $shop,
```

- [ ] **Step 2: Verify the manifest registers all four**

Run: `grep -c "routes/about\|routes/shop" fresh.gen.ts`
Expected: `8` (four imports plus four route entries).

- [ ] **Step 3: Run the full test suite**

Run: `deno task test`
Expected: PASS. Record any pre-existing failures unrelated to this work rather than fixing them here.

- [ ] **Step 4: Type-check every new file**

Run: `deno check routes/about.tsx routes/shop.tsx routes/about/confession-albums.tsx routes/about/respondents.tsx components/PageShell.tsx data/shop.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add fresh.gen.ts
git commit -m "chore: register about, essay and shop routes in manifest"
```

---

### Task 8: Deploy

**Files:** none — this task is operational.

**⚠️ The live tree has an unpushed commit and a dirty working tree.** Do not `git reset --hard`, do not force-pull, do not `git checkout .`. Preserve `ad8e3614` and the uncommitted changes.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/gift-shop-and-about-pages
```

- [ ] **Step 2: Capture the server's state before touching it**

```bash
ssh fob 'cd /var/www/aformulationoftruth && git status --porcelain > /tmp/pre-deploy-status.txt && git stash list && git log --oneline -1'
```

Read the output. Confirm `ad8e3614` is still present.

- [ ] **Step 3: Push the server's unpushed commit to origin first**

```bash
ssh fob 'cd /var/www/aformulationoftruth && git push origin production'
```

If this fails, stop and report. Do not proceed to merge while a commit exists only on the server disk.

- [ ] **Step 4: Merge and deploy**

```bash
ssh fob 'cd /var/www/aformulationoftruth && git fetch origin && git merge --no-ff origin/feat/gift-shop-and-about-pages'
```

If the merge reports conflicts, stop and report rather than resolving blind.

- [ ] **Step 5: Restart the service and reload Caddy**

```bash
ssh fob 'sudo systemctl restart aformulationoftruth-fresh && sudo systemctl reload caddy'
```

- [ ] **Step 6: Verify every route live**

```bash
for p in /about /about/confession-albums /about/respondents /shop; do
  echo "$(curl -sS -o /dev/null -w '%{http_code}' https://aformulationoftruth.com$p)  $p"
done
curl -sS -o /dev/null -w '%{http_code} (expect 301)\n' https://aformulationoftruth.com/about.html
```

Expected: `200` for all four routes, `301` for `/about.html`.

- [ ] **Step 7: Verify one affiliate link and one Stripe link resolve**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -L https://buy.stripe.com/4gM5kD2iS77L0p67K53ZK00
```

Expected: `200`. Open one Penguin and one Amazon link from the rendered page and confirm each lands on the correct title, not a search page or 404.

---

## Self-Review

**Spec coverage:** Routing → Tasks 3–5, 7. Shared layout → Task 2. Shop data model → Task 1. Affiliate links, both retailers, Penguin first → Tasks 1, 3. Payments → Task 1 (links already created; no further Stripe work). Legal disclosure → Task 3. Catalog → Task 1. Essay content → Tasks 5, 6. Testing → every task, plus Task 7. Deployment hazards → Task 8. No gaps.

**Placeholders:** None. The two essay tasks specify content beats and an accuracy gate rather than inventing prose, which is deliberate — writing unverified claims about living people into a plan would guarantee they reach production.

**Type consistency:** `ShopItem`, `RetailerLink`, `AMAZON_TAG`, `buildAmazonUrl`, `buildPenguinUrl`, `BOOKS`, `OWN_ITEMS`, `SHOP_ITEMS` defined in Task 1 and used with identical names in Task 3. `PageShell` and `Ornament` defined in Task 2, imported in Tasks 3–6 with correct relative depth (`../` from `routes/`, `../../` from `routes/about/`).

## Deferred

The **coffee-table invitation node** is not in this plan. It needs its own brainstorm and spec.

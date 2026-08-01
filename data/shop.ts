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

/**
 * One photographed view of a garment — front, back, detail.
 *
 * Every view is a background-removed cutout, so it sits directly on the paper
 * ground with no plate behind it. `src` is the 560w webp (2x the card's slot);
 * `wide` is the cutout at its native resolution, never upscaled past it.
 * `width`/`height` are `src`'s intrinsic pixels and must ship in the markup —
 * views do not share an aspect ratio, so without them the column reflows as
 * each lazy image lands.
 */
export type ProductView = {
  src: string;
  width: number;
  height: number;
  /**
   * A larger variant and its pixel width, for srcset. Omit both when the
   * source has no higher resolution to give — a duplicate candidate would
   * only invite the browser to upscale.
   */
  wide?: string;
  wideWidth?: number;
  alt: string;
  /** Short caption, e.g. 'front'. Omit for a lone view. */
  label?: string;
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
    /**
     * Photographed views. Omit (or leave empty) and the item renders
     * text-only rather than with a placeholder.
     */
    views?: ProductView[];
    /**
     * Buyer-facing disclosure shown beneath the price — lead time, the state
     * of the artwork, anything a buyer should know before paying rather than
     * after. Mirrored into the Stripe link's `custom_text.submit`, so the same
     * words sit above the Pay button; keep the two in step.
     */
    caveat?: string;
  };

/**
 * Amazon Associates tag. Empty until the account tag is supplied; an empty
 * value yields a valid, un-tagged Amazon URL rather than a broken one.
 */
export const AMAZON_TAG = 'a4mulasatya-20';

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
    'Where it begins: the madeleine, Combray, and the long descent into involuntary memory. ' +
      'As an aside I can’t recommend Lydia Davis’ other work enough. Davis’ skillful work as a ' +
      'translator surely enhanced her abilities to write in English. I can’t think of a better ' +
      'writer, and I’ve enjoyed every single piece I’ve ever read by Lydia Davis.',
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
  book(
    'Sodom and Gomorrah',
    '9780143039310',
    'The novel turns and looks directly at what it had been circling.',
    { translator: 'John Sturrock', volume: 4 },
  ),
  book(
    'The Prisoner',
    '9780143133599',
    'Love as surveillance. The most claustrophobic volume, and the most honest about jealousy.',
    { translator: 'Carol Clark', volume: 5 },
  ),
  book(
    'The Fugitive',
    '9780143133704',
    'Absence does its work. Grief arrives late and out of order.',
    { translator: 'Peter Collier', volume: 6 },
  ),
  book(
    'Finding Time Again',
    '9780143133711',
    'The recognition scene the whole sequence was built toward.',
    { translator: 'Ian Patterson', volume: 7 },
  ),
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
    blurb: 'Devotional-intellectual streetwear: Part 10th c. Philosopher icon, part bhairava yantra. WHoly on fleek!',
    price: '$48',
    paymentLink: 'https://buy.stripe.com/aFafZhf5E9fTfk00hD3ZK02',
    caveat:
      'There may be as much as 3–4 weeks lead time on the tee. These are models generated by Artificial Intelligence ' +
      'and the Sanskrit is not as clean as one would desire. As of 29 July ’26 the vector files are in production.',
    views: [
      {
        src: '/images/abhinava-tee-560.webp',
        wide: '/images/abhinava-tee-951.webp',
        width: 560,
        height: 640,
        wideWidth: 951,
        label: 'front',
        alt:
          'Front of a black t-shirt: a portrait of Abhinavagupta holding a lotus and an open manuscript, above a Sanskrit verse in saffron.',
      },
      {
        src: '/images/bhairava-yantra-560.webp',
        wide: '/images/bhairava-yantra-1149.webp',
        width: 560,
        height: 667,
        wideWidth: 1149,
        label: 'back',
        alt:
          'Back of the same t-shirt: a saffron Bhairava yantra — nested triangles and lotus petals within a square gate — beneath the words “oṁ bhairavāya namaḥ” and above “kālabhairava”, lettered in Śāradā script, native to Kaśmir wherefrom hailed the polymath.',
      },
    ],
  },
  {
    kind: 'own',
    title: 'Abhinavabsurd… yet funny!',
    blurb: 'Abhinavagupta in luminous neon, framed by a radiant mandala. Part tantra, part tech satire.',
    price: '$49',
    paymentLink: 'https://buy.stripe.com/eVq4gz6z8fEh3Bi3tP3ZK03',
    views: [
      {
        // One frame carrying both sides, and only 213px wide — the largest
        // source available. No `wide` variant, and the figure is capped to
        // this width rather than upscaled to fill the column.
        src: '/images/abhinavabsurd-213.webp',
        width: 213,
        height: 207,
        label: 'front & back',
        alt:
          'Front and back of a black t-shirt in hot pink: Abhinavagupta reading, captioned “Nobody knows I’m a REFRIGERATOR on the Blockchain”; on the back, a yantra above oil lamps beneath the line “The freedom of the uninterrupted delight of I-consciousness is complettly independent of any reference to anything else.”',
      },
    ],
  },
];

export const SHOP_ITEMS: ShopItem[] = [...BOOKS, ...OWN_ITEMS];

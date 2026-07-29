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

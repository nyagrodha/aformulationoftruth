/**
 * The spoken-word alternative to the image challenge: a question about the
 * sky or the periodic table, in plain text.
 *
 * WHY
 *
 * The digit image (lib/captcha.ts) is unreadable to anyone using a screen
 * reader, and the site has no JavaScript or media to offer instead -- audio is
 * click-to-play at Tor Browser's "Safest" and was set aside for this. A
 * question in words reads aloud like any other label, in any browser.
 *
 * Either passes: the six digits OR this answer. Both come from the same token,
 * and the token is spent once whichever is used (lib/gate-guard.ts), so the
 * pair is one challenge with two ways through, not two challenges.
 *
 * WHAT IT COSTS
 *
 * A question bank is weaker than a distorted image against a bot written for
 * this site, and a language model answers "which constellation is the Lion?"
 * without effort. Against the generic form scripts that were actually hitting
 * the gate it holds, and the per-address and site-wide caps in
 * lib/gate-guard.ts bound what a stronger bot could do with it.
 *
 * The bank is kept to what most people know or can reason out: zodiac
 * constellations by their common names, and everyday elements. Every wrong
 * answer re-draws the form with a fresh token, so a question someone does not
 * know is replaced, not repeated.
 */

export interface TextChallenge {
  /** The question, as it is shown and read aloud. */
  prompt: string;
  /** Accepted answers, already normalised (see normaliseAnswer). */
  answers: string[];
}

/** Lowercase, strip accents and punctuation, drop a leading "the". */
export function normaliseAnswer(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/* Constellations by the name they are known by, which is the question. */
const CONSTELLATIONS: Array<[string, string[]]> = [
  ['the Lion', ['Leo']],
  ['the Twins', ['Gemini']],
  ['the Bull', ['Taurus']],
  ['the Ram', ['Aries']],
  ['the Crab', ['Cancer']],
  ['the Scorpion', ['Scorpius', 'Scorpio']],
  ['the Archer', ['Sagittarius']],
  ['the Scales', ['Libra']],
  ['the Fishes', ['Pisces']],
  ['the Water Bearer', ['Aquarius']],
  ['the Sea Goat', ['Capricornus', 'Capricorn']],
  ['the Maiden', ['Virgo']],
  ['the Hunter', ['Orion']],
  ['the Great Bear', ['Ursa Major', 'Big Dipper', 'Plough', 'Plow']],
  ['the Swan', ['Cygnus']],
];

/* Elements: [symbol, name, other accepted spellings]. */
const ELEMENTS: Array<[string, string, string[]]> = [
  ['H', 'hydrogen', []],
  ['He', 'helium', []],
  ['C', 'carbon', []],
  ['N', 'nitrogen', []],
  ['O', 'oxygen', []],
  ['Ne', 'neon', []],
  ['Fe', 'iron', []],
  ['Cu', 'copper', []],
  ['Ag', 'silver', []],
  ['Au', 'gold', []],
  ['Zn', 'zinc', []],
  ['Pb', 'lead', []],
  ['Na', 'sodium', []],
  ['Ca', 'calcium', []],
  ['Al', 'aluminium', ['aluminum']],
  ['S', 'sulfur', ['sulphur']],
];

/**
 * Say a symbol letter by letter, so a screen reader does not read "Fe" as a
 * word, and so its case is unambiguous on screen.
 */
function spell(symbol: string): string {
  return symbol.split('').map((c, i) => (i === 0 ? `capital ${c}` : `lowercase ${c}`)).join(', ');
}

/** Every question the bank can ask, in a fixed order. */
const BANK: TextChallenge[] = [
  ...CONSTELLATIONS.map(([known, names]) => ({
    prompt: `Which constellation is known as ${known}?`,
    answers: names.map(normaliseAnswer),
  })),
  ...ELEMENTS.map(([symbol, name, other]) => ({
    prompt: `Which element has the chemical symbol ${symbol} (${spell(symbol)})?`,
    answers: [name, ...other].map(normaliseAnswer),
  })),
  // The reverse direction only for one-letter symbols, where it is fair.
  ...ELEMENTS.filter(([symbol]) => symbol.length === 1).map(([symbol, name]) => ({
    prompt: `What is the one-letter chemical symbol for ${name}?`,
    answers: [normaliseAnswer(symbol)],
  })),
];

export const TEXT_CHALLENGE_COUNT = BANK.length;

/** The question for a token, chosen by bytes the caller derived from it. */
export function textChallengeFor(bytes: Uint8Array): TextChallenge {
  const index = ((bytes[0] << 8) | bytes[1]) % BANK.length;
  return BANK[index];
}

export function textAnswerMatches(challenge: TextChallenge, given: string | undefined): boolean {
  const g = normaliseAnswer(given ?? '');
  return g !== '' && challenge.answers.includes(g);
}

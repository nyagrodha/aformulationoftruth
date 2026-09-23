/**
 * A greeting chosen from the visitor's Accept-Language header, never from
 * their IP. Pure and side-effect-free: never log the header (see
 * CLAUDE.md's Zero-Logging Policy) and never throw, no matter how garbled
 * the input is -- a malformed header is worth a fallback greeting, not a
 * 500.
 */

export const GREETINGS: Record<string, string> = {
  en: 'Hi',
  es: 'Hola',
  ta: 'Vanakkam',
  fr: 'Bonjour',
  hi: 'Namaste',
};

export const DEFAULT_GREETING = 'Hi';

/** At most this many comma-separated entries are parsed; the rest are ignored. */
const MAX_ENTRIES = 20;

/** The greeting for the visitor's most-preferred language we have one for; never looks at the IP. */
export function greetingFor(acceptLanguage: string | null): string {
  try {
    if (!acceptLanguage) return DEFAULT_GREETING;

    const entries = acceptLanguage.split(',').slice(0, MAX_ENTRIES);

    type Candidate = { tag: string; q: number; order: number };
    const candidates: Candidate[] = [];

    for (let i = 0; i < entries.length; i++) {
      const part = entries[i].trim();
      if (!part) continue;

      const segments = part.split(';').map((s) => s.trim());
      const tag = segments[0];
      if (!tag) continue;

      // q-value handling (RFC 7231's qvalue is a plain decimal in [0, 1]):
      //   - no q param at all           -> default weight of 1
      //   - a valid decimal q > 1       -> clamped down to 1
      //   - a non-finite parse result   -> falls back to the default weight
      //     of 1 (only reachable in principle -- the digit-only pattern
      //     below can't itself produce Infinity/NaN, but this is the
      //     documented behavior if that ever changes)
      //   - anything else explicitly given as q (negative, or not a plain
      //     non-negative decimal at all, e.g. "q=-1" or "q=abc") is an
      //     invalid weight, not "no weight" -- the WHOLE entry is dropped
      //     rather than silently promoted to the default, so a garbled or
      //     hostile q can't smuggle a language back in at full priority.
      let q = 1;
      let invalidQ = false;
      for (const seg of segments.slice(1)) {
        const m = seg.match(/^q\s*=\s*(.+)$/i);
        if (!m) continue; // not a q param (e.g. a charset param) -- ignore it

        const raw = m[1].trim();
        if (!/^\d+(\.\d+)?$/.test(raw)) {
          invalidQ = true;
          break;
        }
        const parsed = Number(raw);
        q = Number.isFinite(parsed) ? Math.min(1, parsed) : 1;
      }
      if (invalidQ) continue;
      if (q <= 0) continue;

      candidates.push({ tag, q, order: i });
    }

    // Stable sort by q descending, keeping header order for ties.
    candidates.sort((a, b) => b.q - a.q || a.order - b.order);

    for (const { tag } of candidates) {
      const primary = tag.split('-')[0].trim().toLowerCase();
      // Object.hasOwn, not `in` or a truthiness check on GREETINGS[primary]:
      // GREETINGS is a plain object literal, so `in` also matches inherited
      // Object.prototype members (e.g. a tag literally named "constructor"
      // or "toString") and would return that inherited function instead of
      // falling back to DEFAULT_GREETING.
      if (primary && Object.hasOwn(GREETINGS, primary)) return GREETINGS[primary];
    }

    return DEFAULT_GREETING;
  } catch {
    return DEFAULT_GREETING;
  }
}

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

      let q = 1;
      for (const seg of segments.slice(1)) {
        const m = seg.match(/^q\s*=\s*([\d.]+)$/i);
        if (m) {
          const parsed = Number(m[1]);
          q = Number.isFinite(parsed) ? parsed : 1;
        }
      }
      if (q <= 0) continue;

      candidates.push({ tag, q, order: i });
    }

    // Stable sort by q descending, keeping header order for ties.
    candidates.sort((a, b) => b.q - a.q || a.order - b.order);

    for (const { tag } of candidates) {
      const primary = tag.split('-')[0].trim().toLowerCase();
      if (primary && primary in GREETINGS) return GREETINGS[primary];
    }

    return DEFAULT_GREETING;
  } catch {
    return DEFAULT_GREETING;
  }
}

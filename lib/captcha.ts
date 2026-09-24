/**
 * Stateless image challenge for the gate and /login.
 *
 * WHY
 *
 * By 2026-09-23 almost every POST to /api/gate-submit was scripted: HTTP/1.0
 * over TLS 1.2 with no ALPN, or HTTP/1.1 with no ALPN, fetching / and posting
 * four seconds later with a different address each time. Of 1,495 sessions in
 * thirty days, three ever got past question index 0. Each submission made the
 * site mail a magic link to an address the script chose -- the shape of a
 * subscription-bombing run -- and that volume is what put real visitors' links
 * at risk of landing in spam. See docs/superpowers/notes/2026-09-24-gate-abuse.md.
 *
 * The site promises to work in Tor Browser at "Safest", which rules out
 * JavaScript challenges, proof-of-work in the browser, and SVG. What remains is
 * a raster image and a text field.
 *
 * HOW
 *
 * The token is `<issuedAt>.<nonce>`. The answer is not in it: it is derived
 * from HMAC(key, token), so the server holds no state until the token is
 * spent. Spending is recorded (fresh_captcha_spent) so a solved token cannot be
 * replayed; that table is the only persistence, and it holds nonces, nothing
 * about the visitor.
 *
 * Six digits from 2-9 (0/1 read too much like O/l) give 262,144 answers, and
 * the IP rate limit in lib/gate-guard.ts bounds guessing well below that.
 *
 * ACCESSIBILITY
 *
 * An image challenge excludes anyone who cannot see it. The form says so and
 * names a way round it (the webmaster address), because there is no no-JS
 * audio alternative that a script could not read just as easily.
 */

import { encodeGreyscalePng } from './png.ts';

const encoder = new TextEncoder();

export const CAPTCHA_LENGTH = 6;
const ALPHABET = '23456789';

/** Tokens older than this are refused; the form has to be reloaded. */
export const CAPTCHA_MAX_AGE_SECONDS = 30 * 60;
/**
 * Tokens younger than this are refused. A person reads two questions and
 * writes something; the scripts observed post four seconds after fetching.
 * Kept low so a visitor who skips both answers is not caught by it.
 */
export const CAPTCHA_MIN_AGE_SECONDS = 3;

/**
 * Read the key lazily, like lib/jwt.ts: main.ts loads .env after the route
 * manifest has imported this module. CAPTCHA_SECRET if set; otherwise a
 * domain-separated derivation of JWT_SECRET, so no new secret is required to
 * deploy and a captcha MAC can never be mistaken for a JWT signature.
 */
function secretMaterial(): string {
  const dedicated = Deno.env.get('CAPTCHA_SECRET');
  if (dedicated) return dedicated;
  const jwt = Deno.env.get('JWT_SECRET');
  if (!jwt) throw new Error('CAPTCHA_SECRET or JWT_SECRET must be configured');
  return `captcha-v1:${jwt}`;
}

async function mac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretMaterial()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** The answer a token stands for. Deterministic in (key, token). */
export async function answerFor(token: string): Promise<string> {
  const bytes = await mac(`answer:${token}`);
  let out = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Captcha {
  token: string;
  /** `data:image/png;base64,...`, ready for an <img src>. */
  image: string;
}

/** Mint a challenge. `issuedAt` is injectable for tests. */
export async function issueCaptcha(issuedAt: number = nowSeconds()): Promise<Captcha> {
  const token = `${issuedAt}.${randomNonce()}`;
  const png = await renderCaptchaPng(await answerFor(token), await mac(`noise:${token}`));
  return { token, image: `data:image/png;base64,${btoa(String.fromCharCode(...png))}` };
}

export type CaptchaVerdict =
  | { ok: true; nonce: string }
  | { ok: false; reason: 'malformed' | 'expired' | 'too_fast' | 'wrong' };

/**
 * Check an answer against a token. Does NOT record the spend -- the caller
 * does that (lib/gate-guard.ts), so this stays free of I/O and testable.
 */
export async function verifyCaptcha(
  token: string | undefined,
  answer: string | undefined,
  now: number = nowSeconds(),
): Promise<CaptchaVerdict> {
  if (!token || !/^\d{1,12}\.[A-Za-z0-9_-]{16}$/.test(token)) return { ok: false, reason: 'malformed' };
  const [issuedRaw, nonce] = token.split('.');
  const age = now - Number(issuedRaw);
  if (age > CAPTCHA_MAX_AGE_SECONDS || age < -60) return { ok: false, reason: 'expired' };
  if (age < CAPTCHA_MIN_AGE_SECONDS) return { ok: false, reason: 'too_fast' };

  // Forgive what a person plausibly types around six digits.
  const given = (answer ?? '').replace(/[\s\-.]/g, '');
  const expected = await answerFor(token);
  if (given.length !== expected.length) return { ok: false, reason: 'wrong' };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { ok: true, nonce } : { ok: false, reason: 'wrong' };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/* 5x7 bitmaps for 2-9, one string per row, '#' = ink. */
const GLYPHS: Record<string, string[]> = {
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
};

const WIDTH = 240;
const HEIGHT = 80;
const PAPER = 0xe8; // matches --paper in prolegomenon.css, as grey
const INK = 0x17;

/** A tiny deterministic PRNG over the per-token noise bytes. */
function prng(seed: Uint8Array): () => number {
  let s = (seed[0] << 24 | seed[1] << 16 | seed[2] << 8 | seed[3]) >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

async function renderCaptchaPng(answer: string, seed: Uint8Array): Promise<Uint8Array> {
  const rand = prng(seed);
  const px = new Uint8Array(WIDTH * HEIGHT).fill(PAPER);
  const plot = (x: number, y: number, value: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) px[y * WIDTH + x] = value;
  };

  // Faint speckle behind everything.
  for (let i = 0; i < 700; i++) plot(rand() * WIDTH, rand() * HEIGHT, 0x90 + Math.floor(rand() * 0x40));

  // Each glyph gets its own scale, shear, rotation and baseline.
  const cell = WIDTH / (answer.length + 1);
  for (let g = 0; g < answer.length; g++) {
    const rows = GLYPHS[answer[g]];
    const scale = 4.4 + rand() * 0.8;
    const shear = (rand() - 0.5) * 0.3;
    const angle = (rand() - 0.5) * 0.24;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const ox = cell * (g + 0.55) + (rand() - 0.5) * 6;
    const oy = HEIGHT / 2 - 3.5 * scale + (rand() - 0.5) * 8;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] !== '#') continue;
        // Fill each bitmap cell with a block of pixels, transformed.
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const lx = c * scale + dx + shear * (r * scale + dy);
            const ly = r * scale + dy;
            plot(ox + lx * cos - ly * sin, oy + lx * sin + ly * cos, INK);
          }
        }
      }
    }
  }

  // Strike-through curves, drawn in ink so they cannot be thresholded away.
  for (let l = 0; l < 2; l++) {
    const y0 = HEIGHT * (0.3 + rand() * 0.4), amp = 5 + rand() * 8, freq = 0.02 + rand() * 0.03, phase = rand() * 6.28;
    for (let x = 0; x < WIDTH; x++) plot(x, y0 + amp * Math.sin(x * freq + phase), INK);
  }

  return await encodeGreyscalePng(WIDTH, HEIGHT, px);
}

export const CAPTCHA_WIDTH = WIDTH;
export const CAPTCHA_HEIGHT = HEIGHT;

/**
 * The checks every magic-link request passes before anything is stored or sent.
 *
 * Shared by /api/gate-submit and /api/auth/magic-link, the only two endpoints
 * that make the site send mail to an address a stranger typed. Until
 * 2026-09-24 neither had any limit, and scripts were using the gate to mail
 * links to addresses of their choosing -- see
 * docs/superpowers/notes/2026-09-24-gate-abuse.md.
 *
 * Order matters, and is cheapest-and-most-general first:
 *
 *   1. Per-client rate limit. Counted on every attempt, so it also bounds
 *      guessing at the image challenge. IPv6 clients are counted per /64,
 *      since one host usually holds the whole prefix.
 *   2. Honeypot. A field no person sees; filled means a script.
 *   3. Image challenge (lib/captcha.ts), then spend its nonce so it cannot be
 *      replayed. Nothing past this point is reachable without a solved image,
 *      so no script that cannot read one can cause a single email to be sent.
 *   4. Mail domain (lib/mail-domain.ts): refuse an address whose domain has no
 *      mail exchanger, so a typo can be fixed and nothing bounces in the
 *      site's name. After the challenge, so the site is not a free DNS oracle.
 *   5. Per-address cap: two links a day by default (GATE_EMAIL_DAILY_MAX).
 *   6. Site-wide hourly ceiling on mail sent, so that no failure of the checks
 *      above can turn into enough volume to cost the iCloud account.
 *
 * Steps 5 and 6 count mail actually SENT. The guard only peeks at them; the
 * caller records a send with recordSent() once SMTP has accepted it. Nothing
 * is charged up front, so a refusal, a failed send, or a request silenced by
 * the cap leaves the counts untouched -- the design review of 2026-09-24
 * settled on this after charge-then-refund kept growing edge cases (denied
 * attempts left charged, refunds landing in the next day's window).
 *
 * 'silent' outcomes answer exactly as success does -- same status, same body,
 * and (via silentPause) about the same delay, since a real success waits on
 * key provisioning and SMTP. A script that fills the honeypot or hits the
 * per-address cap learns nothing, and the address it named receives nothing.
 *
 * Fails closed: if Postgres cannot be reached this throws, and callers refuse
 * the request rather than send unmetered mail.
 */

import { getClientIp } from './client-ip.ts';
import { verifyCaptcha } from './captcha.ts';
import { hit, ipBucket, peek, record, spendNonce } from './rate-limit.ts';
import { increment } from './metrics.ts';
import { checkMailDomain } from './mail-domain.ts';

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'silent' }
  | { kind: 'refuse'; code: 'captcha' | 'email' | 'rate' | 'busy'; retryAfter?: number };

export interface GuardInput {
  req: Request;
  /** The socket peer, from Fresh's ctx.remoteAddr.hostname. */
  remoteHost: string | undefined;
  /** Used only for the domain lookup; never stored or logged. */
  email: string;
  emailHash: string;
  captchaToken: string | undefined;
  /** The six digits from the image. */
  captchaAnswer: string | undefined;
  /** Or the answer to the token's question in words (lib/text-challenge.ts). */
  questionAnswer?: string | undefined;
  honeypot: string | undefined;
}

export type Guard = (input: GuardInput) => Promise<GuardDecision>;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function envInt(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Requests that reach Deno with no X-Forwarded-For from a loopback peer came
 * through the onion service (vayu forwards straight to 127.0.0.1:7268) rather
 * than through Caddy, which always appends one. Every Tor visitor therefore
 * shares one address, so that bucket gets a larger allowance; Tor's own
 * HiddenServicePoWDefensesEnabled is the per-circuit throttle there.
 */
function isOnion(req: Request, ip: string): boolean {
  return !req.headers.get('x-forwarded-for') && (ip === '127.0.0.1' || ip === '::1');
}

/**
 * The address a client is counted under. IPv4 as-is; IPv4-mapped IPv6 as the
 * IPv4 it maps; other IPv6 reduced to its /64, because a host is normally
 * assigned a whole /64 and can pick a fresh source address per request --
 * each of which would otherwise get a fresh allowance.
 */
export function clientKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const bare = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const mapped = bare.match(/^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/) ??
    bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  const [head, tail] = bare.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = bare.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return groups.slice(0, 4).map((g) => g.padStart(4, '0')).join(':') + '::/64';
}

const DEFAULT_EMAIL_DAILY_MAX = 2;

function emailBucket(emailHash: string): string {
  return `email:${emailHash}`;
}

const GLOBAL_BUCKET = 'global:magiclink';

/**
 * Record one link as sent, against the address and the site-wide ceiling.
 * Call once SMTP has accepted the message, and only then; see steps 5-6.
 */
export async function recordSent(emailHash: string): Promise<void> {
  await record(
    { bucket: emailBucket(emailHash), windowSeconds: DAY },
    { bucket: GLOBAL_BUCKET, windowSeconds: HOUR },
  );
}

/**
 * How long a silenced request waits before answering. A real success spends
 * a few seconds on key provisioning and SMTP (3.7 s in the log that prompted
 * this); answering a silenced one instantly would say which it was. Tests
 * set `ms` to return 0.
 */
export const silentPause = { ms: (): number => 2500 + Math.random() * 2000 };

export function waitSilently(): Promise<void> {
  const ms = silentPause.ms();
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function outcome(decision: GuardDecision, detail: string): GuardDecision {
  increment(`gate.guard.${decision.kind}`);
  increment(`gate.guard.${detail}`);
  return decision;
}

export const guardMagicLinkRequest: Guard = async (input) => {
  const ip = getClientIp(input.req, input.remoteHost);
  const onion = isOnion(input.req, ip);
  const bucket = onion ? 'ip:onion' : await ipBucket(clientKey(ip));

  // 1. Per client.
  const hourly = await hit(
    `${bucket}:h`,
    HOUR,
    onion ? envInt('GATE_ONION_HOURLY_MAX', 40) : envInt('GATE_IP_HOURLY_MAX', 6),
  );
  const daily = await hit(
    `${bucket}:d`,
    DAY,
    onion ? envInt('GATE_ONION_DAILY_MAX', 200) : envInt('GATE_IP_DAILY_MAX', 20),
  );
  if (!hourly.allowed || !daily.allowed) {
    const retryAfter = !hourly.allowed ? hourly.retryAfter : daily.retryAfter;
    return outcome({ kind: 'refuse', code: 'rate', retryAfter }, 'ip_limited');
  }

  // 2. Honeypot.
  if (input.honeypot && input.honeypot.trim() !== '') {
    return outcome({ kind: 'silent' }, 'honeypot');
  }

  // 3. Challenge, then spend it.
  const verdict = await verifyCaptcha(input.captchaToken, {
    digits: input.captchaAnswer,
    text: input.questionAnswer,
  });
  if (!verdict.ok) {
    return outcome({ kind: 'refuse', code: 'captcha' }, `captcha_${verdict.reason}`);
  }
  // Which way through people take: tells whether the question is carrying
  // real load, and so whether its weakness matters. A bare count.
  increment(`gate.guard.passed_via_${verdict.via}`);
  if (!(await spendNonce(verdict.nonce))) {
    return outcome({ kind: 'refuse', code: 'captcha' }, 'captcha_replay');
  }

  // 4. Mail domain.
  if ((await checkMailDomain(input.email)) === 'no_mail') {
    return outcome({ kind: 'refuse', code: 'email' }, 'email_no_mx');
  }

  // 5. Per address.
  const perAddress = await peek(
    emailBucket(input.emailHash),
    DAY,
    envInt('GATE_EMAIL_DAILY_MAX', DEFAULT_EMAIL_DAILY_MAX),
  );
  if (!perAddress.allowed) {
    return outcome({ kind: 'silent' }, 'email_limited');
  }

  // 6. Site-wide.
  const global = await peek(GLOBAL_BUCKET, HOUR, envInt('GATE_GLOBAL_HOURLY_MAX', 30));
  if (!global.allowed) {
    console.error('[gate-guard] Site-wide magic-link ceiling reached');
    return outcome({ kind: 'refuse', code: 'busy', retryAfter: global.retryAfter }, 'global_limited');
  }

  return outcome({ kind: 'allow' }, 'passed');
};

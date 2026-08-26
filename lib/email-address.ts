/**
 * Is this address one that mail can actually reach?
 *
 * The gate now admits people to the questionnaire on the strength of an address
 * they typed, so a typo costs more than it used to: the link that would have
 * brought them back goes nowhere, and they lose their place the moment the
 * 24-hour JWT runs out. Of the magic links this site has ever issued, well over
 * half were never opened. Some of that is spam filtering and some is people
 * changing their minds, but some of it is `gmial.com`, and that part is
 * catchable here for the cost of one DNS lookup.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not block disposable or throwaway providers, and it must never start.
 * This site recommends maildrop.cc on its own front page: an address that
 * exists for an afternoon and belongs to nobody is a perfectly good way to
 * answer thirty-five intimate questions, and arguably the best one. The
 * commercial anti-fraud instinct -- that a throwaway address signals a bad
 * actor -- is exactly backwards for a questionnaire whose whole promise is that
 * the operator cannot read the answers and does not want to know who wrote
 * them.
 *
 * So the only question asked is whether the domain accepts mail at all.
 *
 * The explicit allowlist below is insurance, not policy. Every domain on it
 * would pass the MX check anyway; they are named so that no future change to
 * this file, and no flaky resolver, can lock out the providers this site
 * actively points people toward.
 *
 * Fails OPEN. A resolver that is slow, rate-limited, or down must never become
 * a closed door at the gate: a false rejection turns someone away from the
 * questionnaire entirely, while a false acceptance costs one undelivered email.
 * Only a definitive "this domain has no mail records" rejects.
 */

import { increment } from './metrics.ts';

/**
 * Providers this site recommends or expects, accepted without a lookup.
 *
 * The four names retired from cock.li's roster (tfwno.gf, goat.si,
 * want.cocaine.ninja, bitmessage.ch as of 2026-08-22) are deliberately absent.
 * They publish no MX and no address record, so nobody can deliver mail to them
 * -- accepting one would admit a respondent whose link could only vanish.
 *
 * cock.li is here because it is a real mail provider serving exactly the
 * privacy-minded audience this questionnaire is for, and because third-party
 * "disposable domain" lists routinely and wrongly include it on the strength of
 * its domain names. Its alternates -- there are dozens, and the roster changes
 * -- are not enumerated here; they are caught by COCKLI_MX_SUFFIX below, which
 * recognises them by where their mail actually goes and so covers ones that do
 * not exist yet.
 */
const ALLOWED_DOMAINS = new Set([
  'cock.li',
  'maildrop.cc',
  'mailguard.cc',
]);

/**
 * Any domain whose mail is handled by cock.li is a cock.li domain, whatever it
 * is called. This is the durable form of "accept all of them": it needs no
 * maintenance when they add another, and it cannot be defeated by a name nobody
 * anticipated.
 */
const COCKLI_MX_SUFFIX = 'cock.li';

export type AddressVerdict =
  | { ok: true; checked: 'allowlist' | 'cockli-mx' | 'mx' | 'implicit-a' | 'skipped' }
  | { ok: false; reason: 'syntax' | 'no-mail-records' };

/**
 * Split an address at the last '@'. Local parts may contain '@' when quoted,
 * so the last one is the delimiter, not the first.
 */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const raw = email.slice(at + 1).trim().replace(/\.$/, '');
  if (raw === '') return null;

  // A domain has no port, path, query, or fragment -- so reject anything
  // shaped like one before it ever reaches the URL parser. Left unguarded,
  // `new URL('http://' + raw).hostname` silently drops a suffix like this
  // and returns the bare host, so `example.com/x`, `example.com:443`, and
  // `example.com?x` would each pass as plain `example.com` instead of being
  // rejected as the malformed domains they are.
  if (/[/:?#]/.test(raw)) return null;

  // Through the URL parser, which applies IDNA and hands back punycode. Without
  // it a domain written in its own script -- and the whole point of an
  // internationalised domain is that people write them that way -- fails the
  // ASCII test in looksAddressable and is rejected as malformed, which is both
  // wrong and the kind of wrong nobody reports.
  try {
    const host = new URL(`http://${raw}`).hostname;
    return host === '' ? null : host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Structural checks only -- no attempt to out-clever RFC 5322, which permits
 * far stranger addresses than any regexp people write for it. The submission
 * route already runs Zod's email validator; this catches the domain-shaped
 * mistakes that one lets through, such as a trailing dot or a bare hostname.
 */
function looksAddressable(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253) return false;
  if (!domain.includes('.')) return false;

  // Per LABEL, not per domain. Checking only the first and last character of
  // the whole string accepts `example-.com`, where it is the label that ends in
  // a hyphen -- RFC 1035 forbids that, and letting it through costs a DNS
  // lookup to learn what the shape already said.
  const labels = domain.split('.');
  if (labels.length < 2) return false;

  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    !label.startsWith('-') &&
    !label.endsWith('-') &&
    /^[a-z0-9-]+$/.test(label)
  );
}

/**
 * How long any one DNS question may take.
 *
 * Unauthenticated callers choose the domain, and a nameserver that accepts
 * packets and never answers produces neither a record nor an error -- so the
 * fail-open design, which depends on the resolver replying one way or the
 * other, would instead hold the request open for as long as the system
 * resolver keeps retrying. A deadline turns that silence into the same
 * fail-open path as any other resolver fault.
 */
const DNS_TIMEOUT_MS = 3000;

/** A DNS query that cannot outlast its deadline. */
async function resolveWithin<T>(query: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('dns timeout')), DNS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([query, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isCockliMx(exchange: string): boolean {
  const host = exchange.toLowerCase().replace(/\.$/, '');
  return host === COCKLI_MX_SUFFIX || host.endsWith(`.${COCKLI_MX_SUFFIX}`);
}

/**
 * Can mail reach this address's domain?
 *
 * @param email - The submitted address, already syntax-checked by the caller
 * @returns ok:true unless the domain is malformed or provably accepts no mail
 */
export async function verifyAddressDeliverable(email: string): Promise<AddressVerdict> {
  const domain = domainOf(email);
  if (domain === null || !looksAddressable(domain)) {
    increment('address.rejected.syntax');
    return { ok: false, reason: 'syntax' };
  }

  if (ALLOWED_DOMAINS.has(domain)) {
    increment('address.accepted.allowlist');
    return { ok: true, checked: 'allowlist' };
  }

  try {
    const mx = await resolveWithin(Deno.resolveDns(domain, 'MX'));
    if (mx.length > 0) {
      // Reported distinctly so the guarantee is observable rather than
      // asserted: every live cock.li domain routes through mx1/mx2.cock.li,
      // which is what makes the suffix rule cover the ones not yet invented.
      if (mx.some((record) => isCockliMx(record.exchange))) {
        increment('address.accepted.cockli');
        return { ok: true, checked: 'cockli-mx' };
      }
      increment('address.accepted.mx');
      return { ok: true, checked: 'mx' };
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      // Resolver trouble rather than an answer. Let them through -- see the
      // fail-open note at the top of this file.
      increment('address.check.unavailable');
      return { ok: true, checked: 'skipped' };
    }
  }

  // No MX. RFC 5321 says a domain with an address record still accepts mail
  // there, and plenty of small self-hosted domains rely on exactly that, so a
  // missing MX alone is not an answer.
  for (const kind of ['A', 'AAAA'] as const) {
    try {
      const records = await resolveWithin(Deno.resolveDns(domain, kind));
      if (records.length > 0) {
        increment('address.accepted.implicit_a');
        return { ok: true, checked: 'implicit-a' };
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        increment('address.check.unavailable');
        return { ok: true, checked: 'skipped' };
      }
    }
  }

  // Category only, and no part of the address: the domain alone can identify a
  // person at a small or self-hosted one (/var/www/CLAUDE.md).
  increment('address.rejected.no_mail_records');
  return { ok: false, reason: 'no-mail-records' };
}

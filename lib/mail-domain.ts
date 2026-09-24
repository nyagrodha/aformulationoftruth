/**
 * Can this address's domain receive mail at all?
 *
 * The one check on an address that is possible before sending to it. The magic
 * link is the real verification -- only someone who reads the mailbox can
 * open it -- but a link sent to a domain with no mail exchanger is a message
 * that bounces back to the iCloud account in the site's name, and a stream of
 * those is part of what lowers the account's reputation with receiving
 * providers. Mistyped domains (gmial.com) are also caught here, while the
 * visitor is still on the page to correct them.
 *
 * Rules:
 *   - At least one MX record is required. Implicit MX (mail to a bare A
 *     record, RFC 5321 §5.1) is legal but no mailbox provider a person uses
 *     relies on it, and throwaway domains do.
 *   - A null MX (RFC 7505: a single MX of "." ) means the domain declares it
 *     accepts no mail.
 *   - NXDOMAIN or an empty answer is "no".
 *   - Any other DNS failure (timeout, SERVFAIL) is "unknown", which callers
 *     treat as acceptable: a resolver hiccup must not turn a person away, and
 *     every other check in lib/gate-guard.ts still applies.
 *
 * Only the domain is looked up and only the domain is cached. The address is
 * never logged or kept.
 */

export type MailDomainVerdict = 'ok' | 'no_mail' | 'unknown';

type MxRecord = { preference: number; exchange: string };
type Resolver = (domain: string) => Promise<MxRecord[]>;

const defaultResolver: Resolver = (domain) => Deno.resolveDns(domain, 'MX');

/** Test seam. Undefined in production, which uses Deno.resolveDns. */
export const mailDomainResolverForTesting: { current?: Resolver } = {};

const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 5000;
const cache = new Map<string, { verdict: MailDomainVerdict; at: number }>();

/** Exposed for tests. */
export function clearMailDomainCache(): void {
  cache.clear();
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase().replace(/\.$/, '');
}

async function lookup(domain: string): Promise<MailDomainVerdict> {
  const resolve = mailDomainResolverForTesting.current ?? defaultResolver;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      resolve(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      }),
    ]);
    if (records.length === 0) return 'no_mail';
    const nullMx = records.every((r) => r.exchange === '' || r.exchange === '.');
    return nullMx ? 'no_mail' : 'ok';
  } catch (e) {
    // Deno raises NotFound for NXDOMAIN and for a name with no MX records.
    return e instanceof Deno.errors.NotFound ? 'no_mail' : 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export async function checkMailDomain(email: string): Promise<MailDomainVerdict> {
  const domain = domainOf(email);
  if (!domain || !domain.includes('.')) return 'no_mail';

  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.verdict;

  const verdict = await lookup(domain);
  // Only definite answers are cached; 'unknown' is retried next time.
  if (verdict !== 'unknown') {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(domain, { verdict, at: Date.now() });
  }
  return verdict;
}

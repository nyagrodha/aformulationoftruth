/**
 * Client address resolution, honouring TRUST_PROXY.
 *
 * routes/api/contact.ts used to carry a private copy of this function. The
 * merge note that used to live here predicted the exact failure that then
 * happened: proxy trust is the kind of rule that must not exist twice, because
 * one copy updated and the other not is a silent security difference, not a
 * visible bug, and nothing fails to compile to reveal it. The copy was deleted
 * on 2026-08-19 when the last-element fix below landed, since fixing only one
 * of the two would have left the contact rate limiter bypassable.
 *
 * X-Forwarded-For is client-supplied unless a proxy overwrites it. Trusting
 * it unconditionally would let anyone forge an address -- for the scan
 * counter that means inflating the count arbitrarily, for the rate limiter it
 * means bypassing the limit. So it is honoured only when the deployment
 * asserts, via TRUST_PROXY, that something upstream rewrites the header.
 *
 * TRUST_PROXY is necessary but not sufficient, and the difference is which END
 * of the header you read. Caddy's reverse_proxy APPENDS the peer to whatever
 * arrived; it does not replace it, and no `trusted_proxies` is configured here.
 * So a request carrying `X-Forwarded-For: 1.2.3.4` reaches the app as
 * `1.2.3.4, <real peer>` and the FIRST element is the forgery. Reading the
 * first element is what this function used to do, which meant scan counts were
 * inflatable and the contact rate limit was bypassable by anyone who set the
 * header themselves.
 *
 * The LAST element is the one Caddy itself wrote, so that is the one to trust,
 * for exactly one trusted hop. Note this is the correct read even where the
 * proxy does not append: a single-element header has the same first and last
 * value, so nothing changes there.
 *
 * The failure direction is now an undercount rather than unbounded forgery.
 * Traffic arriving through a second hop (the shared-host path) collapses onto
 * that hop's address and is counted as one visitor. Undercounting a metric is
 * a cost; letting a stranger choose their own identity is a vulnerability.
 */

/**
 * Resolve the client address.
 *
 * @param req the incoming request
 * @param remoteHost the socket peer, from Fresh's ctx.remoteAddr.hostname
 * @returns the address, or 'unknown' when neither source yields one
 */
export function getClientIp(req: Request, remoteHost: string | undefined): string {
  const trustProxy = Deno.env.get('TRUST_PROXY') === 'true';
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      // Last, not first -- see the header comment. Scanning from the right for
      // the first non-empty entry also tolerates a trailing comma, which would
      // otherwise yield an empty string and silently fall through to the peer.
      const parts = xff.split(',');
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts[i]?.trim();
        if (candidate) return candidate;
      }
    }
  }
  return remoteHost || 'unknown';
}

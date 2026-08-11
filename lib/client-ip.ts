/**
 * Client address resolution, honouring TRUST_PROXY.
 *
 * MERGE NOTE: routes/api/contact.ts carries a private copy of this function,
 * but that file lives on `production` and not on `main`, which is where this
 * branch is cut from -- so the two cannot be reconciled here. When this
 * reaches production, delete contact.ts's copy and import this one instead.
 * Proxy trust is exactly the kind of rule that must not exist twice: one copy
 * updated and the other not is a silent security difference, not a visible
 * bug, and nothing would fail to compile to reveal it.
 *
 * X-Forwarded-For is client-supplied unless a proxy overwrites it. Trusting
 * it unconditionally would let anyone forge an address -- for the scan
 * counter that means inflating the count arbitrarily, for the rate limiter it
 * means bypassing the limit. So it is honoured only when the deployment
 * asserts, via TRUST_PROXY, that something upstream rewrites the header.
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
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return remoteHost || 'unknown';
}

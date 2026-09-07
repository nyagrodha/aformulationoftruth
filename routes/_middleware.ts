/**
 * Global request hook, for audience counting only.
 *
 * Every page request passes through here so lib/audience.ts can fold the
 * visitor into an in-memory count. Nothing per-visitor is written down; see
 * that module's header for what is and is not being claimed.
 *
 * The rule this file must never break: counting is bookkeeping, and bookkeeping
 * must not be able to change what a visitor receives. Every failure path below
 * ends in the response going out unchanged.
 */

import { FreshContext } from '$fresh/server.ts';
import { getClientIp } from '../lib/client-ip.ts';
import { recordVisit, startAudienceFlush } from '../lib/audience.ts';
import { increment } from '../lib/metrics.ts';

/**
 * Endpoints excluded from the count.
 *
 * /api/health and /api/metrics are polled by monitoring -- the daily report
 * fetches the latter on every run -- so counting them would mean the busiest
 * "visitor" on the site is the site's own supervision.
 */
const NOT_COUNTED = new Set(['/api/health', '/api/metrics']);

// The flush timer is unref'd, so starting it at module load neither holds the
// process open nor delays shutdown.
startAudienceFlush();

export async function handler(req: Request, ctx: FreshContext): Promise<Response> {
  // Only real page and API routes. Static assets, Fresh's island chunks and
  // internal requests all carry a different destination and would otherwise
  // multiply one visit into a dozen.
  if (ctx.destination !== 'route') return await ctx.next();

  const pathname = new URL(req.url).pathname;
  if (NOT_COUNTED.has(pathname)) return await ctx.next();

  // Global Privacy Control and Do Not Track. Strictly speaking there is nothing
  // here to opt out of -- no pseudonym is stored, so honouring these only makes
  // the count slightly low. They are honoured anyway: a site that publishes "No
  // behavioral profiling" and then quietly ignores the header a visitor set to
  // say they mean it has kept the letter and lost the point.
  if (req.headers.get('sec-gpc') === '1' || req.headers.get('dnt') === '1') {
    increment('visits.optout');
    return await ctx.next();
  }

  try {
    const remoteHost = (ctx as { remoteAddr?: { hostname?: string } }).remoteAddr?.hostname;
    await recordVisit(
      req.headers.get('host'),
      getClientIp(req, remoteHost),
      req.headers.get('user-agent') ?? '',
    );
  } catch {
    // Category only, never the error: it could carry the address. recordVisit
    // does no I/O, so this should be unreachable -- which is exactly why it is
    // worth counting if it ever fires.
    increment('errors.audience.record');
  }

  return await ctx.next();
}

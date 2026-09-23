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
 *
 * Classification (lib/visit-class.ts) needs the RESPONSE -- status and
 * Content-Type -- so it runs after `ctx.next()`, not before. That is a change
 * from the pre-2026-09-23 version of this file, which recorded before the
 * response existed and so counted redirects, 404s and API calls as visits;
 * see docs/superpowers/notes/2026-09-23-audience-metric-audit.md (F4, F6, F7).
 */

import { FreshContext } from '$fresh/server.ts';
import { getClientIp } from '../lib/client-ip.ts';
import { recordOptOutNavigation, recordVisit, startAudienceFlush } from '../lib/audience.ts';
import { classifyVisit, optedOut } from '../lib/visit-class.ts';
import { increment } from '../lib/metrics.ts';

/**
 * Test seam: lets routes/_middleware_test.ts force a throw, or observe a
 * call, without touching Postgres or lib/audience.ts's real hashing --
 * the same pattern as `brooch.status` in routes/api/brooch/status.ts.
 */
export const audience = { recordVisit, recordOptOutNavigation };

// The flush timer is unref'd, so starting it at module load neither holds the
// process open nor delays shutdown.
startAudienceFlush();

export async function handler(req: Request, ctx: FreshContext): Promise<Response> {
  // Only real page and API routes. Static assets, Fresh's island chunks and
  // internal requests all carry a different destination and would otherwise
  // multiply one visit into a dozen.
  if (ctx.destination !== 'route') return await ctx.next();

  const pathname = new URL(req.url).pathname;
  const res = await ctx.next(); // classification needs the response; response is untouched below

  try {
    const cls = classifyVisit(req.method, pathname, req.headers, res.status, res.headers.get('content-type'));

    // Global Privacy Control and Do Not Track. Honoured strictly: an opted-out
    // request never gets a pseudonym computed for it at all, not even the
    // in-heap, never-persisted kind every other bucket gets. Only the fact
    // that it WOULD have been a person is worth anything, so that is the only
    // thing kept -- as a plain count, never a set.
    if (optedOut(req.headers)) {
      increment('visits.optout');
      if (cls === 'person') {
        await audience.recordOptOutNavigation(req.headers.get('host'));
      }
      return res;
    }

    if (cls === 'none') return res;

    const remoteHost = (ctx as { remoteAddr?: { hostname?: string } }).remoteAddr?.hostname;
    const ip = getClientIp(req, remoteHost);
    await audience.recordVisit(req.headers.get('host'), ip, req.headers.get('user-agent') ?? '', cls);
  } catch {
    // Category only, never the error: it could carry the address. recordVisit
    // does no I/O, so this should be unreachable -- which is exactly why it is
    // worth counting if it ever fires.
    increment('errors.audience.record');
  }

  return res;
}

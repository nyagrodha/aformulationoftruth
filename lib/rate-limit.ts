/**
 * Simple in-memory IP rate limiter.
 *
 * Reads RATE_LIMIT_WINDOW_MS (default 60000) and RATE_LIMIT_MAX (default 5)
 * from the env, matching the values already declared in .env.example.
 *
 * Buckets are keyed by (namespace, ip). Namespace lets each endpoint have
 * its own quota so noise on one route can't starve another.
 *
 * Caveats: per-process state, so this loses accuracy behind multiple
 * instances or after a restart. For the current single-process Fresh
 * deployment behind Caddy it's a real defense; upgrade to a shared store
 * (Redis, Postgres, Deno KV) if the app scales horizontally.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 5;
const PRUNE_INTERVAL_MS = 5 * 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPruneAt = 0;

function config() {
  const window = parseInt(Deno.env.get('RATE_LIMIT_WINDOW_MS') ?? '', 10);
  const max = parseInt(Deno.env.get('RATE_LIMIT_MAX') ?? '', 10);
  return {
    windowMs: Number.isFinite(window) && window > 0 ? window : DEFAULT_WINDOW_MS,
    max: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX,
  };
}

function pruneIfDue(now: number): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Extract the client IP from the request, honoring X-Forwarded-For when
 * TRUST_PROXY is set (the Caddyfile in front of this app sets XFF).
 */
export function clientIp(req: Request): string {
  const trustProxy = (Deno.env.get('TRUST_PROXY') ?? 'true').toLowerCase() !== 'false';
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  // Fresh doesn't expose the raw socket peer; fall back to a stable
  // placeholder so unproxied dev requests still bucket together.
  return 'unknown';
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
}

export function checkRateLimit(namespace: string, ip: string): RateLimitDecision {
  const { windowMs, max } = config();
  const now = Date.now();
  pruneIfDue(now);

  const key = `${namespace}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterSec: 0, limit: max };
  }

  if (existing.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec, limit: max };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: max - existing.count,
    retryAfterSec: 0,
    limit: max,
  };
}

/** Test-only: reset all buckets. */
export function _resetForTests(): void {
  buckets.clear();
  lastPruneAt = 0;
}

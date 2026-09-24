/**
 * Postgres-backed fixed-window rate limiting.
 *
 * In Postgres rather than in memory (as routes/api/contact.ts does) because a
 * limit that resets on every deploy or crash is a limit a patient script can
 * wait out, and this one guards mail sent in the site's name.
 *
 * Addresses are never written down: ipBucket() HMACs the client address with
 * a server secret before it becomes a row key, so fresh_rate_limits holds
 * opaque strings and a count. Caddy's log filter already deletes client IPs;
 * this table must not become the place they are kept instead.
 */

import { withConnection as realWithConnection } from './db.ts';

/** Test seam, as in routes/api/gate-submit.ts. Undefined in production. */
export const rateLimitDbForTesting: { withConnection?: typeof realWithConnection } = {};

const withConnection: typeof realWithConnection = (handler) =>
  (rateLimitDbForTesting.withConnection ?? realWithConnection)(handler);

const encoder = new TextEncoder();

/** Counters are dropped once their window started this long ago. */
const RETAIN_SECONDS = 2 * 24 * 60 * 60;

export interface RateResult {
  allowed: boolean;
  count: number;
  limit: number;
  /** Seconds until this window closes. */
  retryAfter: number;
}

/**
 * Count one event against `bucket` and report whether it is within `limit` for
 * the current `windowSeconds`-long window. The increment happens whether or not
 * the event is allowed, so hammering a closed window keeps it closed.
 */
export async function hit(bucket: string, windowSeconds: number, limit: number): Promise<RateResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  const count = await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ count: number }>(
      `INSERT INTO fresh_rate_limits (bucket, window_start, count)
       VALUES ($1, to_timestamp($2), 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET count = fresh_rate_limits.count + 1
       RETURNING count`,
      [bucket, windowStart],
    );

    // Opportunistic pruning keeps the table small without a timer.
    if (Math.random() < 0.02) {
      await client.queryObject(
        `DELETE FROM fresh_rate_limits WHERE window_start < to_timestamp($1)`,
        [now - RETAIN_SECONDS],
      );
    }

    return Number(rows[0]?.count ?? Number.MAX_SAFE_INTEGER);
  });

  return { allowed: count <= limit, count, limit, retryAfter: windowStart + windowSeconds - now };
}

/**
 * Read a bucket's count for the current window without changing it, and
 * report whether one more event would still be within `limit`.
 *
 * For limits on outcomes rather than attempts. The per-address and site-wide
 * link limits count mail actually SENT: the guard peeks, and the route calls
 * record() only after a send succeeds. Nothing is charged up front, so there
 * is nothing to hand back when a request is refused or a send fails.
 *
 * The cost is a race: two concurrent requests can both see room and both
 * send, overshooting by the number in flight. For a limit of two a day, that
 * is an acceptable price for never capping someone by mail they did not get.
 */
export async function peek(bucket: string, windowSeconds: number, limit: number): Promise<RateResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const count = await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ count: number }>(
      `SELECT count FROM fresh_rate_limits WHERE bucket = $1 AND window_start = to_timestamp($2)`,
      [bucket, windowStart],
    );
    return Number(rows[0]?.count ?? 0);
  });
  return { allowed: count < limit, count, limit, retryAfter: windowStart + windowSeconds - now };
}

/** Count one completed event against `bucket` in the current window. */
export async function record(bucket: string, windowSeconds: number): Promise<void> {
  await hit(bucket, windowSeconds, Number.MAX_SAFE_INTEGER);
}

/**
 * Record a spent challenge nonce. Returns false if it was already spent, i.e.
 * the submission is a replay.
 */
export async function spendNonce(nonce: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ nonce: string }>(
      `INSERT INTO fresh_captcha_spent (nonce) VALUES ($1)
       ON CONFLICT (nonce) DO NOTHING
       RETURNING nonce`,
      [nonce],
    );
    if (Math.random() < 0.02) {
      // Challenges expire after thirty minutes; a day is ample.
      await client.queryObject(`DELETE FROM fresh_captcha_spent WHERE spent_at < NOW() - INTERVAL '1 day'`);
    }
    return rows.length === 1;
  });
}

/**
 * The bucket key for a client address. HMAC'd so the table never holds the
 * address itself; truncated because a collision only means two clients share
 * a limit.
 */
export async function ipBucket(ip: string): Promise<string> {
  const material = Deno.env.get('CAPTCHA_SECRET') || Deno.env.get('JWT_SECRET');
  if (!material) throw new Error('CAPTCHA_SECRET or JWT_SECRET must be configured');
  const secret = `ratelimit-v1:${material}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`ip:${ip}`)));
  return 'ip:' + Array.from(sig.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

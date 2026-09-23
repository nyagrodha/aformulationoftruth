import { withConnection } from './db.ts';
import { type DeliveryBundle, KeyboxUnavailableError, pushBundle } from './romania-client.ts';

export async function enqueueDelivery(bundle: DeliveryBundle & { keyId: string }): Promise<string> {
  const deliveryId = crypto.randomUUID();
  return await withConnection(async (client) => {
    // One request per session, including double-clicks and repeated form posts.
    // A terminal failure requires investigation; it must not be an SMTP resend loop.
    await client.queryObject(
      `INSERT INTO pdf_delivery_jobs (session_id, gate_token, delivery_id, bundle)
       VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (session_id) DO UPDATE
       SET delivery_id = EXCLUDED.delivery_id, bundle = EXCLUDED.bundle, state = 'pending',
           attempts = 0, last_error = NULL, created_at = NOW(), updated_at = NOW(),
           next_attempt_at = NOW(), lease_until = NULL, expires_at = NOW() + INTERVAL '24 hours'
       WHERE pdf_delivery_jobs.state = 'cancelled'`,
      [bundle.sessionId, bundle.keyId, deliveryId, JSON.stringify({ ...bundle, deliveryId })],
    );
    const r = await client.queryObject<{ state: string }>(
      'SELECT state FROM pdf_delivery_jobs WHERE session_id = $1',
      [bundle.sessionId],
    );
    if (!r.rows[0]) throw new Error('delivery owner disappeared');
    return r.rows[0].state;
  });
}

export async function cancelDelivery(sessionId: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const r = await client.queryObject(
      `UPDATE pdf_delivery_jobs SET state = 'cancelled', bundle = NULL, updated_at = NOW()
       WHERE session_id = $1 AND state = 'pending' RETURNING 1`,
      [sessionId],
    );
    return r.rows.length > 0;
  });
}

export function retryDelay(attempt: number): number {
  return Math.min(3600, 60 * 2 ** Math.min(attempt - 1, 6));
}

/** Leases survive worker crashes. A stable deliveryId makes retries idempotent at the renderer. */
export async function processDelivery(send: typeof pushBundle = pushBundle): Promise<boolean> {
  const job = await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE pdf_delivery_jobs SET state = 'failed', last_error = 'expired', bundle = NULL,
         updated_at = NOW(), lease_until = NULL
       WHERE state IN ('pending', 'processing') AND expires_at <= NOW()
         AND (lease_until IS NULL OR lease_until < NOW())`,
    );
    await client.queryObject(
      "DELETE FROM pdf_delivery_jobs WHERE state IN ('sent', 'failed', 'cancelled') AND updated_at < NOW() - INTERVAL '7 days'",
    );
    const r = await client.queryObject<{ delivery_id: string; bundle: DeliveryBundle; attempts: number }>(
      `WITH due AS (
         SELECT session_id FROM pdf_delivery_jobs
         WHERE expires_at > NOW() AND next_attempt_at <= NOW()
           AND (state = 'pending' OR (state = 'processing' AND lease_until < NOW()))
         ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE pdf_delivery_jobs j SET state = 'processing', attempts = attempts + 1,
           lease_until = NOW() + INTERVAL '10 minutes', updated_at = NOW()
         FROM due WHERE j.session_id = due.session_id
         RETURNING j.delivery_id, j.bundle, j.attempts`,
    );
    return r.rows[0];
  });
  if (!job) return false;
  let stage: string | null = null;
  let permanent = false;
  try {
    await send(job.bundle);
  } catch (e) {
    stage = e instanceof KeyboxUnavailableError ? e.stage : 'worker';
    permanent = e instanceof KeyboxUnavailableError && e.permanent;
  }
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE pdf_delivery_jobs SET state = $2, last_error = $3, updated_at = NOW(),
         lease_until = NULL, next_attempt_at = NOW() + $4 * INTERVAL '1 second',
         bundle = CASE WHEN $2 = 'pending' THEN bundle ELSE NULL END
       WHERE delivery_id = $1 AND state = 'processing' AND attempts = $5`,
      [
        job.delivery_id,
        stage === null ? 'sent' : permanent ? 'failed' : 'pending',
        stage,
        retryDelay(job.attempts),
        job.attempts,
      ],
    );
  });
  return true;
}

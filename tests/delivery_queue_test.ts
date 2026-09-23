/** Explicit opt-in; this suite cannot touch the production database. */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { closePool, withConnection } from '../lib/db.ts';
import { cancelDelivery, enqueueDelivery, processDelivery } from '../lib/delivery-queue.ts';
import { KeyboxUnavailableError } from '../lib/romania-client.ts';
import { hashResumeToken } from '../lib/crypto.ts';
import { handler } from '../routes/api/responses/deliver.ts';

const database = Deno.env.get('DELIVERY_TEST_DATABASE');
if (database) {
  if (!/^a4t_delivery_test_[0-9]+$/.test(database)) throw Error('isolated test database required');
  const url = new URL(Deno.env.get('DATABASE_URL')!);
  url.pathname = '/' + database;
  Deno.env.set('DATABASE_URL', url.toString());
}

Deno.test({
  name: 'durable delivery: consent, distinct gate IDs, leases, retries, cancellation, expiry',
  ignore: !database,
  async fn(t) {
    const sql = (query: string, args: unknown[] = []) => withConnection((c) => c.queryObject(query, args));
    try {
      await sql(`CREATE TABLE IF NOT EXISTS fresh_questionnaire_sessions (
        session_id VARCHAR(64) PRIMARY KEY, email_hash TEXT, question_order TEXT,
        answered_questions INTEGER[], current_index INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ);
        CREATE TABLE IF NOT EXISTS fresh_gate_responses (
        gate_token VARCHAR(64) PRIMARY KEY, linked_session_id VARCHAR(64), session_pubkey TEXT,
        encrypted_email TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE IF NOT EXISTS gate_encrypted_answers (
        session_id TEXT, question_index BIGINT, question_text TEXT, ciphertext TEXT, skipped BOOLEAN);`);
      await sql(await Deno.readTextFile(new URL('../db/migrations/015_pdf_delivery_queue.sql', import.meta.url)));
      await sql(
        'TRUNCATE pdf_delivery_jobs, gate_encrypted_answers, fresh_gate_responses, fresh_questionnaire_sessions CASCADE',
      );
      const token = 'synthetic-resume-token';
      const sessionId = await hashResumeToken(token), keyId = crypto.randomUUID();
      await sql(
        `INSERT INTO fresh_questionnaire_sessions
        (session_id, email_hash, question_order, answered_questions, current_index, completed_at)
        VALUES ($1, 'test', '0,1,2', ARRAY[0,1,2], 35, NOW())`,
        [sessionId],
      );
      await sql(
        `INSERT INTO fresh_gate_responses (gate_token, linked_session_id, session_pubkey, encrypted_email)
        VALUES ($1,$2,'unused-public-key','encrypted-address')`,
        [keyId, sessionId],
      );
      await sql(
        `INSERT INTO gate_encrypted_answers VALUES
        ($1,0,'gate question','gate-cipher',false), ($2,2,'later question','later-cipher',false)`,
        [keyId, sessionId],
      );

      await t.step('completed respondent can queue; gate and later answers are both included', async () => {
        const request = new Request('http://localhost/api/responses/deliver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: 'yes', resume_token: token }),
        });
        const response = await (handler.POST as CallableFunction)(request, {});
        assertEquals(response.status, 202);
        const rows = await withConnection((c) =>
          c.queryObject<{ bundle: { keyId: string; sessionId: string; answers: { ciphertext: string }[] } }>(
            'SELECT bundle FROM pdf_delivery_jobs',
          )
        );
        const b = rows.rows[0].bundle;
        assertEquals([b.keyId, b.sessionId], [keyId, sessionId]);
        assertEquals([b.answers[0].ciphertext, b.answers[2].ciphertext], ['gate-cipher', 'later-cipher']);
      });

      await t.step('repeated consent keeps the same job; failed transport survives reconnection', async () => {
        const r = await withConnection((c) =>
          c.queryObject<{ bundle: Parameters<typeof enqueueDelivery>[0]; delivery_id: string }>(
            'SELECT bundle, delivery_id FROM pdf_delivery_jobs',
          )
        );
        await enqueueDelivery(r.rows[0].bundle);
        await processDelivery(() => {
          throw new KeyboxUnavailableError();
        });
        await closePool();
        const after = await withConnection((c) =>
          c.queryObject<{ state: string; attempts: number; delivery_id: string }>(
            'SELECT state, attempts, delivery_id FROM pdf_delivery_jobs',
          )
        );
        assertEquals(after.rows[0], { state: 'pending', attempts: 1, delivery_id: r.rows[0].delivery_id });
      });

      await t.step('a live lease excludes another worker; an expired lease is recovered', async () => {
        await sql(
          "UPDATE pdf_delivery_jobs SET state='processing', lease_until=NOW()+INTERVAL '1 minute', next_attempt_at=NOW()",
        );
        assertEquals(await processDelivery(() => Promise.resolve()), false);
        await sql("UPDATE pdf_delivery_jobs SET lease_until=NOW()-INTERVAL '1 minute'");
        let calls = 0;
        assert(
          await processDelivery(() => {
            calls++;
            return Promise.resolve();
          }),
        );
        assertEquals(calls, 1);
        const r = await withConnection((c) =>
          c.queryObject<{ state: string; bundle: unknown }>('SELECT state, bundle FROM pdf_delivery_jobs')
        );
        assertEquals(r.rows[0], { state: 'sent', bundle: null });
      });

      await t.step('ambiguous SMTP is terminal and ciphertext is removed', async () => {
        await sql("UPDATE pdf_delivery_jobs SET state='pending', next_attempt_at=NOW(), bundle='{}'::jsonb");
        await processDelivery(() => {
          throw new KeyboxUnavailableError('uncertain', true);
        });
        const r = await withConnection((c) =>
          c.queryObject<{ state: string; bundle: unknown; last_error: string }>(
            'SELECT state, bundle, last_error FROM pdf_delivery_jobs',
          )
        );
        assertEquals(r.rows[0], { state: 'failed', bundle: null, last_error: 'uncertain' });
      });

      await t.step('cancellation and expiry discard queued ciphertext', async () => {
        await sql("UPDATE pdf_delivery_jobs SET state='pending', bundle='{}'::jsonb");
        assert(await cancelDelivery(sessionId));
        await sql(
          "UPDATE pdf_delivery_jobs SET state='pending', bundle='{}'::jsonb, expires_at=NOW()-INTERVAL '1 second'",
        );
        assertEquals(
          await processDelivery(() => {
            throw Error('expired job sent');
          }),
          false,
        );
        const r = await withConnection((c) =>
          c.queryObject<{ state: string; bundle: unknown; last_error: string }>(
            'SELECT state, bundle, last_error FROM pdf_delivery_jobs',
          )
        );
        assertEquals(r.rows[0], { state: 'failed', bundle: null, last_error: 'expired' });
      });
    } finally {
      await closePool();
    }
  },
});

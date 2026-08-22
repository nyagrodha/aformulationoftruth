/**
 * Session reuse: one row per address, a credential that rotates.
 *
 * These tests pin the invariant migration 012 exists to make possible. Before
 * it, submitting the gate a second time with the same address stamped
 * `completed_at` on the session already open and started a fresh one, which
 * (a) broke the magic link already sitting in that person's inbox, because
 * every read path filters `completed_at IS NULL`, and (b) orphaned every answer
 * already stored, because ciphertext is filed under `session_id`. 2,737 of
 * 2,767 sessions on record sit at index 0 as a result.
 *
 * `startOrResumeSession` must therefore keep the row -- identity, order,
 * progress -- and rotate only `resume_token_hash`. What follows asserts each
 * half of that separately, so a regression says which half broke.
 *
 * Requires Postgres with migration 012 applied. Skips cleanly without
 * DATABASE_URL. Sends no mail, touches no key box, needs no HTTP server.
 *
 * Run with: deno task test tests/session_reuse_test.ts
 */

import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { hashEmail } from '../lib/crypto.ts';
import { withConnection } from '../lib/db.ts';
import {
  completeSession,
  getSessionById,
  getSessionByToken,
  getSessionRecord,
  startOrResumeSession,
  updateSessionIndex,
} from '../lib/questionnaire-session.ts';

const HAS_DB = !!Deno.env.get('DATABASE_URL');

// hashResumeToken throws without this. Any value works here -- the tests only
// require that the same secret hashes consistently within one run -- but the
// real one is used when the environment already carries it.
if (HAS_DB && !Deno.env.get('RESUME_TOKEN_SECRET')) {
  // Random per run rather than a literal, for the same reason as the JWT
  // secret in tests/jwt_via_test.ts: a fixed credential-shaped string in the
  // repository is indistinguishable from a real leaked one.
  Deno.env.set('RESUME_TOKEN_SECRET', crypto.randomUUID());
}

/**
 * A throwaway address hash. Random rather than fixed so two runs, or a run
 * against a database that still holds a previous run's leftovers, cannot
 * collide on the "one unfinished session per address" lookup.
 */
function throwawayEmailHash(): Promise<string> {
  return hashEmail(`${crypto.randomUUID()}@session-reuse.test.invalid`);
}

/** Every row this file creates is keyed by its throwaway hash; delete by it. */
async function deleteSessionsFor(emailHash: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `DELETE FROM fresh_questionnaire_sessions WHERE email_hash = $1`,
      [emailHash],
    );
  });
}

/** Columns the public readers deliberately do not expose. */
async function rawRow(
  sessionId: string,
): Promise<{ resume_token_hash: string | null; completed_at: string | null } | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ resume_token_hash: string | null; completed_at: string | null }>(
      `SELECT resume_token_hash, completed_at
         FROM fresh_questionnaire_sessions
        WHERE session_id = $1`,
      [sessionId],
    );
    return rows.length === 0 ? null : rows[0];
  });
}

Deno.test({
  name: 'startOrResumeSession - a second submission reuses the row and mints a new token',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const first = await startOrResumeSession(emailHash);
      const before = await rawRow(first.sessionId);
      const second = await startOrResumeSession(emailHash);
      const after = await rawRow(first.sessionId);

      assertEquals(first.reused, false, 'the first call creates the session');
      assertEquals(second.reused, true, 'the second call must resume, not create');
      assertEquals(second.sessionId, first.sessionId, 'session_id is the identity and must not move');

      // Deliberately NOT `second.opaqueToken !== first.opaqueToken`. generateResumeToken
      // runs at the top of startOrResumeSession on every call, before the transaction, so
      // that inequality holds even if the rotating UPDATE is deleted outright -- it proves
      // nothing about the row. What has to move is the hash stored against the session.
      assert(before !== null && after !== null, 'the row must exist on both sides of the resume');
      assertNotEquals(
        after.resume_token_hash,
        before.resume_token_hash,
        'the credential stored against the row must rotate',
      );
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

Deno.test({
  name: 'startOrResumeSession - resuming does not stamp completed_at on the earlier session',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const first = await startOrResumeSession(emailHash);
      await startOrResumeSession(emailHash);

      // This is the whole bug. createQuestionnaireSession stamped completed_at
      // here to keep one active session per address, and every read path
      // filters on it -- so the link already in the inbox resolved to nothing.
      const row = await rawRow(first.sessionId);
      assert(row !== null, 'the row must still exist after a resume');
      assertEquals(row.completed_at, null, 'a resume must never mark the session finished');

      // And the reader that enforces "still answerable" must agree.
      const live = await getSessionById(first.sessionId);
      assert(live !== null, 'the session must still be answerable after a resume');
      assertEquals(live.completedAt, undefined);
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

Deno.test({
  name: 'startOrResumeSession - progress and question order survive a resume',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const first = await startOrResumeSession(emailHash);

      // Somebody gets partway through, then submits the gate again.
      await updateSessionIndex(first.sessionId, 7);

      const second = await startOrResumeSession(emailHash);

      assertEquals(
        second.questionOrder,
        first.questionOrder,
        'reshuffling would orphan answers already filed against the old positions',
      );

      const resumed = await getSessionById(second.sessionId);
      assert(resumed !== null, 'the resumed session must be readable');
      assertEquals(resumed.currentIndex, 7, 'progress must not be reset by a resume');
      assertEquals(resumed.questionOrder, first.questionOrder);
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

Deno.test({
  name: 'getSessionByToken - the old token stops resolving, the new one resolves to the same session',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const first = await startOrResumeSession(emailHash);

      // Before rotation the first token is live.
      const beforeRotation = await getSessionByToken(first.opaqueToken);
      assert(beforeRotation !== null, 'the token just issued must resolve');
      assertEquals(beforeRotation.sessionId, first.sessionId);

      const second = await startOrResumeSession(emailHash);

      // After rotation it is not. Unavoidable: only the hash is stored, so a
      // usable link cannot be reissued without minting a new token.
      assertEquals(
        await getSessionByToken(first.opaqueToken),
        null,
        'the rotated-away token must no longer resolve',
      );

      const afterRotation = await getSessionByToken(second.opaqueToken);
      assert(afterRotation !== null, 'the newly issued token must resolve');
      assertEquals(
        afterRotation.sessionId,
        beforeRotation.sessionId,
        'both tokens address one session -- the row is the same row',
      );
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

Deno.test({
  name: 'a finished session - getSessionById refuses it, getSessionRecord and getSessionByToken do not',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const { sessionId, opaqueToken } = await startOrResumeSession(emailHash);

      assert(await getSessionById(sessionId) !== null, 'unfinished sessions are answerable');

      await completeSession(sessionId);

      // "May this person still answer questions" -- no.
      assertEquals(await getSessionById(sessionId), null, 'a finished session is not answerable');

      // "Does this session exist" -- yes, and everything that happens after the
      // last question (collecting a copy, the consent form on /completion)
      // depends on this answer being yes.
      const record = await getSessionRecord(sessionId);
      assert(record !== null, 'a finished session must still be readable by identity');
      assertEquals(record.sessionId, sessionId);
      assert(record.completedAt instanceof Date, 'the record carries the completion time');

      // The token path has to agree, and for the same reason. Collecting a copy happens
      // after the last question, so a `completed_at IS NULL` filter here is exactly what
      // made the consent form on /completion answer "no session" to everyone who finished.
      const byToken = await getSessionByToken(opaqueToken);
      assert(byToken !== null, 'the resume token must still resolve a finished session');
      assertEquals(byToken.sessionId, sessionId);
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

Deno.test({
  name: 'startOrResumeSession - a brand-new session has resume_token_hash === session_id',
  ignore: !HAS_DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const emailHash = await throwawayEmailHash();
    try {
      const { sessionId } = await startOrResumeSession(emailHash);

      // The pre-migration-012 invariant, which the backfill assumed: on a row
      // that has never been resumed the credential and the identity are the
      // same value, so every link issued before the column existed still
      // resolves through the new lookup.
      const row = await rawRow(sessionId);
      assert(row !== null, 'the new session must exist');
      assertEquals(row.resume_token_hash, sessionId);

      // ...and it stops being true the moment the credential rotates.
      await startOrResumeSession(emailHash);
      const rotated = await rawRow(sessionId);
      assert(rotated !== null);
      assertNotEquals(rotated.resume_token_hash, sessionId, 'rotation must move the credential off the identity');
    } finally {
      await deleteSessionsFor(emailHash);
    }
  },
});

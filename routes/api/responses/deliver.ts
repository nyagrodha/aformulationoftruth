/**
 * Delivery Consent Endpoint
 *
 * POST /api/responses/deliver
 *
 * Where a respondent says whether they want a copy of what they wrote. The
 * consent form on /completion posts here, urlencoded and without JavaScript.
 *
 * What this does NOT do is read anyone's answers. It assembles ciphertext it
 * cannot open, encrypts the chosen password to the same recipients, and hands
 * the bundle to the key box. Only the key box holds the identity.
 */

import { Handlers } from '$fresh/server.ts';
import { withConnection } from '../../../lib/db.ts';
import { increment } from '../../../lib/metrics.ts';
import { ageEncryptTo } from '../../../lib/age-encrypt.ts';
import { breakglassRecipient } from '../../../lib/session-keys.ts';
import { getSessionRecord } from '../../../lib/questionnaire-session.ts';
import { hashResumeToken } from '../../../lib/crypto.ts';
import { type DeliveryBundle } from '../../../lib/romania-client.ts';
import { cancelDelivery, enqueueDelivery } from '../../../lib/delivery-queue.ts';
import { GATE_QUESTIONS } from '../../../lib/gate_encrypt.ts';
import { QUESTIONS as TAMIL_QUESTIONS } from '../../../lib/questions_dakshinaparvanuvadam.ts';

/** The canonical questionnaire: gate questions 0-1 plus 2-34. */
export const CANONICAL_COUNT = 35;

interface AnswerRow {
  question_index: number;
  question_text: string;
  ciphertext: string;
  skipped: boolean;
}

/**
 * The question text for an index the respondent never reached.
 *
 * A synthesized entry still needs its question, or the document would show a
 * numbered blank with nothing to explain it.
 */
function canonicalQuestionText(index: number): string {
  const q = TAMIL_QUESTIONS.find((x) => x.id === index);
  if (q) return q.english;
  return GATE_QUESTIONS[index] ?? `Question ${index + 1}`;
}

/**
 * Assemble the bundle the key box will render.
 *
 * Canonical order (0-34), deliberately NOT the order the respondent answered
 * in. The shuffle stays in the session row; the document every respondent
 * receives reads identically.
 *
 * Gaps are filled rather than omitted. A short document looks complete to
 * someone who cannot be expected to remember which of 35 questions they were
 * asked, and dropping entries would renumber everything after them.
 */
export function buildBundle(
  sessionId: string,
  rows: AnswerRow[],
  encryptedEmail: string,
  encryptedPassword: string | null,
  keyId: string = sessionId,
): DeliveryBundle {
  const byIndex = new Map<number, AnswerRow>();
  for (const r of rows) {
    if (!Number.isInteger(r.question_index) || r.question_index < 0 || r.question_index >= CANONICAL_COUNT) {
      // Not a row from this questionnaire. Dropping it silently would conceal
      // a real inconsistency in the store.
      throw new Error(`question index out of range: ${r.question_index}`);
    }
    if (byIndex.has(r.question_index)) {
      throw new Error(`duplicate answer for question ${r.question_index}`);
    }
    byIndex.set(r.question_index, r);
  }

  const answers = Array.from({ length: CANONICAL_COUNT }, (_, questionIndex) => {
    const row = byIndex.get(questionIndex);
    if (row) {
      return {
        questionIndex,
        questionText: row.question_text,
        ciphertext: row.ciphertext,
        skipped: row.skipped,
      };
    }
    return {
      questionIndex,
      questionText: canonicalQuestionText(questionIndex),
      ciphertext: '',
      skipped: true,
    };
  });

  return { sessionId, keyId, answers, encryptedEmail, encryptedPassword };
}

/**
 * Read the consent choice.
 *
 * Fails closed: only the literal value the form submits counts as yes.
 * Anything else -- absent, empty, mis-cased, or an array from a duplicated
 * field -- is treated as no, because the cost of guessing wrong is mailing
 * someone's intimate answers they did not ask for.
 */
export function consentFrom(body: Record<string, unknown>): 'yes' | 'no' {
  return body.consent === 'yes' ? 'yes' : 'no';
}

/** Parse either a native form post or a JSON fetch, mirroring gate-submit. */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    }
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (Object.hasOwn(obj, key)) return null;
      if (typeof value === 'string') obj[key] = value;
    }
    return obj;
  } catch {
    return null;
  }
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const wantsJson = (req.headers.get('content-type') || '').includes('application/json') ||
      (req.headers.get('accept') || '').includes('application/json');

    const done = (status: number, message: string, fragment: string) => {
      if (wantsJson) {
        return new Response(JSON.stringify({ message }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 303, headers: { Location: `/completion?${fragment}` } });
    };

    const body = await readBody(req);
    if (body === null) {
      increment('errors.4xx');
      return done(400, 'Invalid request body', 'copy=invalid');
    }

    if (body.consent !== 'yes' && body.consent !== 'no') {
      return done(400, 'Choose whether you want a copy.', 'copy=invalid');
    }
    const consent = consentFrom(body);
    const resumeToken = typeof body.resume_token === 'string' ? body.resume_token : '';

    if (consent === 'no') {
      if (resumeToken) {
        try {
          await cancelDelivery(await hashResumeToken(resumeToken));
        } catch {
          return done(503, 'Unable to cancel the pending copy. Please try again.', 'copy=error');
        }
      }
      increment('delivery.declined');
      return done(200, 'No new copy requested. Any copy already sending cannot be recalled.', 'copy=declined');
    }

    if (!resumeToken) {
      increment('errors.4xx');
      return done(400, 'Missing session', 'copy=nosession');
    }

    try {
      // getSessionRecord, not getSessionByToken: the latter drops finished
      // sessions, and everyone who reaches this form has finished. Today that
      // only works because the form path never stamps completed_at (it serves
      // 31 of 33 questions); the day it does, every copy would be "not found".
      const session = await getSessionRecord(await hashResumeToken(resumeToken));
      if (!session || Date.now() - session.updatedAt.getTime() > 30 * 86400_000) {
        increment('errors.4xx');
        return done(404, 'Session not found or already closed.', 'copy=nosession');
      }

      const row = await withConnection(async (client) => {
        const r = await client.queryObject<
          { gate_token: string; session_pubkey: string | null; encrypted_email: string | null }
        >(
          `SELECT gate_token, session_pubkey, encrypted_email
             FROM fresh_gate_responses
            WHERE linked_session_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
          [session.sessionId],
        );
        return r.rows[0];
      });

      // A session that predates per-session keys has no key in the key box and
      // no address encrypted to one, so no copy can be produced. Say so plainly
      // rather than accepting the request and failing silently in a queue the
      // respondent cannot see.
      if (!row?.session_pubkey || !row?.encrypted_email) {
        increment('delivery.unavailable_legacy');
        return done(
          409,
          'A copy is not available for a questionnaire begun before this feature existed.',
          'copy=unavailable',
        );
      }

      const recipients = [row.session_pubkey, breakglassRecipient()];

      // The password never reaches this process's storage or logs. It is
      // NFC-normalised first: the same characters typed on different systems
      // can differ byte-for-byte, and a password that will not reopen the
      // document is worse than none.
      if (body.password !== undefined && typeof body.password !== 'string') {
        return done(400, 'Invalid password.', 'copy=invalid');
      }
      const raw = typeof body.password === 'string' ? body.password : '';
      const password = raw.normalize('NFC');
      if (password.length > 256 || /[\r\n]/.test(password)) {
        return done(400, 'Use a password of at most 256 characters without line breaks.', 'copy=invalid');
      }
      const encryptedPassword = password.length > 0 ? await ageEncryptTo(password, recipients) : null;

      const rows = await withConnection(async (client) => {
        const r = await client.queryObject<AnswerRow>(
          `SELECT question_index::int AS question_index, question_text, ciphertext, skipped
             FROM gate_encrypted_answers
            WHERE (session_id = $1 AND question_index >= 2)
               OR (session_id = $2 AND question_index IN (0, 1))
            ORDER BY question_index`,
          [session.sessionId, row.gate_token],
        );
        return r.rows;
      });

      const bundle = buildBundle(session.sessionId, rows, row.encrypted_email, encryptedPassword, row.gate_token);
      const state = await enqueueDelivery({ ...bundle, keyId: row.gate_token });
      if (state === 'failed' || state === 'cancelled') {
        return done(409, 'Your previous request needs attention. Please contact the webmaster.', 'copy=attention');
      }
      increment('delivery.queued');
      return done(
        202,
        state === 'sent' ? 'Your copy has been sent.' : 'Your copy is queued for delivery.',
        state === 'sent' ? 'copy=sent' : 'copy=queued',
      );
    } catch {
      // Category only: the thrown error could carry ciphertext or an address.
      console.error('[deliver] delivery request failed');
      increment('errors.5xx');
      return done(500, 'Something went wrong. Please try again.', 'copy=error');
    }
  },
};

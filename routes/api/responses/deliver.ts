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
import { getSessionByToken } from '../../../lib/questionnaire-session.ts';
import { type DeliveryBundle, KeyboxUnavailableError, pushBundle } from '../../../lib/romania-client.ts';
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

  return { sessionId, answers, encryptedEmail, encryptedPassword };
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
    if (contentType.includes('application/json')) return await req.json();
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
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

    const consent = consentFrom(body);
    const resumeToken = typeof body.resume_token === 'string' ? body.resume_token : '';

    // "No" ends here. Nothing is pushed, nothing is decrypted; the completion
    // page offers deletion from there.
    if (consent === 'no') {
      increment('delivery.declined');
      return done(200, 'No copy will be sent.', 'copy=declined');
    }

    if (!resumeToken) {
      increment('errors.4xx');
      return done(400, 'Missing session', 'copy=nosession');
    }

    try {
      const session = await getSessionByToken(resumeToken);
      if (!session) {
        increment('errors.4xx');
        return done(404, 'Session not found or already closed.', 'copy=nosession');
      }

      const row = await withConnection(async (client) => {
        const r = await client.queryObject<{ session_pubkey: string | null; encrypted_email: string | null }>(
          `SELECT session_pubkey, encrypted_email
             FROM fresh_gate_responses
            WHERE linked_session_id = $1
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
      const raw = typeof body.password === 'string' ? body.password : '';
      const password = raw.normalize('NFC');
      const encryptedPassword = password.length > 0 ? await ageEncryptTo(password, recipients) : null;

      const rows = await withConnection(async (client) => {
        const r = await client.queryObject<AnswerRow>(
          `SELECT question_index, question_text, ciphertext, skipped
             FROM gate_encrypted_answers
            WHERE session_id = $1
            ORDER BY question_index`,
          [session.sessionId],
        );
        return r.rows;
      });

      const bundle = buildBundle(session.sessionId, rows, row.encrypted_email, encryptedPassword);

      try {
        await pushBundle(bundle);
        increment('delivery.pushed');
        return done(200, 'Your copy is on its way.', 'copy=sent');
      } catch (e) {
        if (e instanceof KeyboxUnavailableError) {
          // The respondent consented; that consent must not evaporate because
          // the mesh was down for a moment. Task 8b makes this durable -- until
          // then, say plainly that it did not go rather than implying it did.
          increment('delivery.keybox_unavailable');
          console.error('[deliver] key box unavailable; copy not sent');
          return done(503, 'We could not send your copy just now. Please try again shortly.', 'copy=retry');
        }
        throw e;
      }
    } catch {
      // Category only: the thrown error could carry ciphertext or an address.
      console.error('[deliver] delivery request failed');
      increment('errors.5xx');
      return done(500, 'Something went wrong. Please try again.', 'copy=error');
    }
  },
};

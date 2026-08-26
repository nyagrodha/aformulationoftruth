/**
 * Recording one questionnaire answer.
 *
 * Extracted 2026-08-21, when it turned out that not one questionnaire answer
 * had ever been stored. `gate_encrypted_answers` held 2,194 rows at
 * question_index 0 and 2,194 at index 1 — the two gate questions — and nothing
 * above that, across 2,565 sessions.
 *
 * The cause was in routes/questionnaire.tsx: its POST handler called its own
 * /api/questions/answer endpoint over HTTP, forwarding the `jwt` cookie alone.
 * That endpoint requires an `Authorization: Bearer` header and a resume token,
 * so the call returned 401 every time. The handler logged the failure and then
 * advanced the session index anyway, so the questionnaire walked forward
 * question by question, looked entirely healthy to the person answering it, and
 * discarded every word they wrote.
 *
 * Two lessons are built into this module:
 *
 *   1. A server handler that has already authenticated the caller must not
 *      re-enter its own HTTP surface to do work. The round trip re-imposes an
 *      auth contract the caller has no way to satisfy — cookies are not
 *      forwarded, headers are not reconstructed — and turns a function call
 *      into a second authentication problem. Call the function.
 *
 *   2. Storing an answer either succeeds or throws. It does NOT return a
 *      status for a caller to overlook, because that is exactly what happened:
 *      a non-ok response landed in a log line nobody read, and the only
 *      externally visible symptom was an empty table nobody was looking at.
 */

import { getSessionPubkey } from './questionnaire-session.ts';
import { storeEncryptedAnswer } from './gate-client.ts';
import { breakglassRecipient } from './session-keys.ts';
import { getQuestionById } from './questions_dakshinaparvanuvadam.ts';
import { increment, trackFunnelQuestion } from './metrics.ts';

/**
 * Recipients for a session's answers.
 *
 * A session minted after per-session keys shipped always has a pubkey --
 * gate-submit fails closed, so one cannot exist without it -- and its answers
 * go to that key plus the offline break-glass key.
 *
 * A NULL pubkey means the session predates this feature. Those return an empty
 * list, which storeEncryptedAnswer sends as `recipients: []` and the gate reads
 * as "use my configured default": exactly the behaviour the session started
 * under. Throwing instead would break every questionnaire in flight at deploy
 * time, mid-run, at whichever question the respondent happened to be on.
 *
 * Such sessions stay readable by the global identity and simply never become
 * PDF-eligible -- /api/responses/deliver checks session_pubkey before offering
 * a copy, so nobody is promised a document that cannot be rendered.
 *
 * This branch is temporary. `sessions.legacy_recipients` counts every use; once
 * it reads zero for longer than a session can live, delete the branch and make
 * a missing pubkey an error again.
 */
export function recipientsForSession(
  sessionPubkey: string | null,
  breakglass: () => string,
): string[] {
  if (!sessionPubkey) {
    increment('sessions.legacy_recipients');
    return [];
  }
  // A thunk, not a string: breakglassRecipient() throws when unconfigured, and
  // an eagerly-evaluated argument would throw on the legacy path too -- turning
  // a missing env var into a failure for sessions that never needed the key.
  return [sessionPubkey, breakglass()];
}

/**
 * The English text of a question, for the encrypted record.
 *
 * Sourced from the canonical list rather than a local copy. Three separate
 * hardcoded arrays of the same 35 strings existed before this — in
 * questionnaire.tsx, in answer.ts, and in the module that actually owns them —
 * which is three chances for the stored question text to drift away from the
 * question the respondent was shown.
 */
export function questionTextFor(questionIndex: number): string {
  return getQuestionById(questionIndex)?.english ?? `Question ${questionIndex}`;
}

export interface RecordAnswerParams {
  sessionId: string;
  /** Canonical question index, 0-34. */
  questionIndex: number;
  /** The respondent's text. Ignored when `skipped`. */
  answer: string;
  skipped: boolean;
}

/**
 * Encrypt and store one answer. Throws if it was not stored.
 *
 * Callers must let the throw propagate rather than advancing the session:
 * an answer that is not on disk has not been given, and moving to the next
 * question is how the original bug hid for the whole life of the feature.
 */
export async function recordAnswer(params: RecordAnswerParams): Promise<void> {
  const sessionPubkey = await getSessionPubkey(params.sessionId);

  await storeEncryptedAnswer({
    sessionId: params.sessionId,
    questionText: questionTextFor(params.questionIndex),
    questionIndex: params.questionIndex,
    answer: params.skipped ? '' : params.answer,
    skipped: params.skipped,
    recipients: recipientsForSession(sessionPubkey, breakglassRecipient),
  });

  increment('answers.stored');

  // Only after the answer is on disk. See the note in routes/api/gate-submit.ts:
  // this helper had no caller at all, which is why every funnel step past
  // 'gate viewed' read 0.
  trackFunnelQuestion(params.questionIndex);
}

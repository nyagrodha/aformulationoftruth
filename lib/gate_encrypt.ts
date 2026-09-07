/**
 * Client for the Rust gate service (aformulationoftruth-gate).
 *
 * The gate owns answer encryption. It age-encrypts each answer to an x25519
 * recipient whose private identity never touches this server, then stores the
 * armored ciphertext. Plaintext answers must never be written to Postgres —
 * see the User Input Encryption rule in CLAUDE.md.
 *
 * This module is the only thing that should send answer text anywhere —
 * gate questions and Q2–Q34 both call it. There is no second client and no
 * GATE_API_KEY: the Rust service binds loopback and does not read X-Gate-Key,
 * so requiring a key the gate ignores made later answers 500 while the
 * landing form still worked.
 *
 * It FAILS CLOSED. If the gate is unreachable, storeEncryptedAnswer throws and
 * the caller must abort the submission. It must never fall back to storing
 * plaintext: a silent downgrade to plaintext is the exact failure this service
 * exists to prevent.
 */

import { increment } from './metrics.ts';

const GATE_URL = Deno.env.get('GATE_URL') || 'http://127.0.0.1:8787';
const TIMEOUT_MS = 5000;

export class GateUnavailableError extends Error {
  constructor(reason: string) {
    // Reason is a category name only — never an answer, never a response body.
    super(`Gate encryption unavailable: ${reason}`);
    this.name = 'GateUnavailableError';
  }
}

interface StoreAnswerArgs {
  /** Opaque, unlinkable token. Doubles as the gate's session_id. */
  sessionId: string;
  questionIndex: number;
  questionText: string;
  /** Plaintext. Leaves this process only over loopback, to the gate. */
  answer: string;
  skipped?: boolean;
  /**
   * age recipients to encrypt to. Omitted or empty means "use the gate's own
   * configured recipient", which is how every answer worked before per-session
   * keys and how pre-existing sessions still work.
   */
  recipients?: string[];
}

/**
 * Age-encrypt one answer and store it. Throws GateUnavailableError on any
 * failure, so callers fail the whole submission rather than persist plaintext.
 */
export async function storeEncryptedAnswer(args: StoreAnswerArgs): Promise<void> {
  const { sessionId, questionIndex, questionText, answer, skipped = false, recipients = [] } = args;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${GATE_URL}/api/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        question_index: questionIndex,
        question_text: questionText,
        answer,
        skipped,
        recipients,
      }),
      signal: controller.signal,
    });
  } catch {
    // Network failure or timeout. No detail is logged: the request body holds
    // the answer, and an error object could carry it.
    increment('gate.encrypt.unreachable');
    throw new GateUnavailableError('unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Drain the body so the connection can be reused; never read it into a log.
    await res.body?.cancel();
    increment('gate.encrypt.rejected');
    throw new GateUnavailableError(`status ${res.status}`);
  }

  await res.body?.cancel();
  increment('gate.encrypt.stored');
}

/** The two gate questions, in the order the landing form posts them. */
export const GATE_QUESTIONS = [
  'What is your idea of perfect happiness?',
  'What is your greatest fear?',
] as const;

/**
 * Gate Client - Routes answer storage through Rust Gate for age encryption.
 *
 * All answers (gate questions 0-1 and questionnaire questions 2-34) are
 * sent to the Rust Gate service which encrypts them with age before storing.
 * No plaintext answers are ever stored in the database.
 */

interface StoreAnswerParams {
  sessionId: string;
  questionText: string;
  questionIndex: number;
  answer: string;
  skipped: boolean;
}

interface StoreAnswerResult {
  ok: boolean;
  requestId: string;
}

const GATE_URL = Deno.env.get('GATE_URL') || 'http://127.0.0.1:8787';
const GATE_API_KEY = Deno.env.get('GATE_API_KEY') || '';

/**
 * Store an answer via the Rust Gate service (age-encrypted).
 *
 * Sends the answer to Gate's /api/store endpoint which encrypts it
 * with age x25519 before inserting into gate_responses.
 *
 * Throws on network/auth errors. Caller should catch and handle gracefully.
 */
export async function storeEncryptedAnswer(
  params: StoreAnswerParams
): Promise<StoreAnswerResult> {
  if (!GATE_API_KEY) {
    throw new Error('GATE_API_KEY not configured');
  }

const GATE_TIMEOUT_MS = 5000;

export async function storeEncryptedAnswer(
  params: StoreAnswerParams
): Promise<StoreAnswerResult> {
  const res = await fetch(`${GATE_URL}/api/store`, {
    signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gate-Key': GATE_API_KEY,
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      question_text: params.questionText,
      question_index: params.questionIndex,
      answer: params.answer,
      skipped: params.skipped,
    }),
  });
}

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gate /api/store failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { ok: data.ok, requestId: data.request_id };
}

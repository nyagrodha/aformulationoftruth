/**
 * Gate Client - Sends answers to Rust Gate service for age x25519 encryption
 *
 * The Gate service encrypts answers before storage so that only the
 * private key holder can decrypt them.
 */

interface StoreAnswerParams {
  sessionId: string;
  questionText: string;
  questionIndex: number;
  answer: string;
  skipped: boolean;
}

const GATE_URL = () => Deno.env.get('GATE_URL') || 'http://127.0.0.1:8787';

export async function storeEncryptedAnswer(params: StoreAnswerParams): Promise<void> {
  const url = `${GATE_URL()}/api/store`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: params.sessionId,
      question_text: params.questionText,
      question_index: params.questionIndex,
      answer: params.answer,
      skipped: params.skipped,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Gate store failed (${res.status}): ${text}`);
  }
}

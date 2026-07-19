/**
 * Questionnaire Responses Endpoint — RETIRED (fails closed)
 *
 * POST /api/responses
 *
 * This endpoint previously inserted `JSON.stringify(answers)` straight into
 * `fresh_responses.answers` with NO encryption, despite the schema comment
 * claiming "client-encrypted answers." Nothing in the app encrypts answers on
 * the client, so every call persisted PLAINTEXT questionnaire answers at rest —
 * a direct violation of the mandatory User Input Encryption policy in CLAUDE.md.
 *
 * Answer text is owned end-to-end by the Rust gate (`lib/gate_encrypt.ts`),
 * which age-encrypts each answer before storage and fails closed. That is the
 * ONLY sanctioned path for answer text. This endpoint has no live caller, so it
 * is retired rather than left as a latent plaintext sink: it now refuses every
 * request instead of storing anything.
 *
 * If a JSON answer-submission path is ever needed again, route it through
 * `storeEncryptedAnswer` (never a direct INSERT of answer text) and delete this
 * notice.
 */

import { Handlers } from '$fresh/server.ts';
import { increment } from '../../lib/metrics.ts';

export const handler: Handlers = {
  POST(_req, _ctx) {
    // Fail closed. Never accept, hash, log, or store the body: doing so would
    // reintroduce the plaintext-at-rest sink this endpoint was retired to close.
    increment('responses.retired.rejected');

    return new Response(
      JSON.stringify({
        error: 'This endpoint is retired. Answer text must be encrypted through the gate before storage.',
      }),
      {
        status: 410, // Gone
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  },
};

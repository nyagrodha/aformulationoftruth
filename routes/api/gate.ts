/**
 * Gate API Endpoint
 *
 * POST /api/gate - Store gate question response
 *
 * gupta-vidya compliance:
 * - No PII stored
 * - Gate token is random, unlinkable
 * - Answers stored as-is (client can encrypt before sending)
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { increment } from '../../lib/metrics.ts';
import { GATE_QUESTIONS, storeEncryptedAnswer } from '../../lib/gate_encrypt.ts';

const GateSubmitSchema = z.object({
  gateToken: z.string().min(1).max(128),
  questionIndex: z.number().int().min(0).max(1),
  answer: z.string().max(20000),
  skipped: z.boolean(),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsed = GateSubmitSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid request format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { gateToken, questionIndex, answer, skipped } = parsed.data;

    try {
      // Answer text goes to the Rust gate, which age-encrypts it. It is never
      // written to Postgres in the clear — q0_answer/q1_answer stay NULL.
      // Fails closed: if the gate is down we refuse rather than store plaintext.
      try {
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionIndex,
          questionText: GATE_QUESTIONS[questionIndex] ?? `question ${questionIndex}`,
          answer: skipped ? '' : answer,
          skipped,
        });
      } catch {
        console.error('[gate] Gate encryption unavailable; refusing to store');
        increment('errors.5xx');
        return new Response(
          JSON.stringify({ error: 'Unable to securely store your answer right now.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Linkage row only. Carries no answer text.
      await withConnection(async (client) => {
        const { rows: existing } = await client.queryObject<{ id: number }>(
          `SELECT id FROM fresh_gate_responses WHERE gate_token = $1`,
          [gateToken]
        );

        if (existing.length === 0) {
          await client.queryObject(
            `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer)
             VALUES ($1, NULL, NULL)`,
            [gateToken]
          );
        }
      });

      increment('questionnaire.started');

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[gate] Failed to store response');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Storage failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

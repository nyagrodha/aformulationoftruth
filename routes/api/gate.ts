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
      await withConnection(async (client) => {
        // Check if response already exists for this token and question
        const { rows: existing } = await client.queryObject<{ id: number }>(
          `SELECT id FROM fresh_gate_responses
           WHERE gate_token = $1`,
          [gateToken]
        );

        if (existing.length > 0) {
          // Update existing row
          const column = questionIndex === 0 ? 'q0_answer' : 'q1_answer';
          await client.queryObject(
            `UPDATE fresh_gate_responses
             SET ${column} = $1
             WHERE gate_token = $2`,
            [skipped ? null : answer, gateToken]
          );
        } else {
          // Insert new row
          const q0 = questionIndex === 0 ? (skipped ? null : answer) : null;
          const q1 = questionIndex === 1 ? (skipped ? null : answer) : null;

          await client.queryObject(
            `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer)
             VALUES ($1, $2, $3)`,
            [gateToken, q0, q1]
          );
        }
      });

      increment('questionnaire.started');

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (_error) {
      console.error('[gate] Failed to store response');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Storage failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

/**
 * Gate API Endpoint
 *
 * POST /api/gate - Store gate question response
 *
 * gupta-vidya compliance:
 * - No PII stored
 * - Gate token is random, unlinkable
 * - Answers encrypted via Rust Gate (age x25519) before storage
 * - fresh_gate_responses only stores gate_token for session linking (no answer text)
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { increment } from '../../lib/metrics.ts';
import { storeEncryptedAnswer } from '../../lib/gate-client.ts';

const GATE_QUESTIONS = [
  'What is your idea of perfect happiness?',
  'What is your greatest fear?',
];

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
      // Store answer via Rust Gate (age-encrypted into gate_responses)
      await storeEncryptedAnswer({
        sessionId: gateToken,
        questionText: GATE_QUESTIONS[questionIndex],
        questionIndex,
        answer: skipped ? '' : answer,
        skipped,
      });

      // Upsert fresh_gate_responses as linking table (no answer text)
      await withConnection(async (client) => {
        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token)
           VALUES ($1)
           ON CONFLICT (gate_token) DO NOTHING`,
          [gateToken]
        );
      });

      increment('questionnaire.started');

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[gate] Failed to store encrypted response:', error);
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Storage failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

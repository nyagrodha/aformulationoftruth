/**
 * Questionnaire Responses Endpoint
 *
 * POST /api/responses
 *
 * gupta-vidya compliance:
 * - Email is hashed immediately, plaintext never stored
 * - Answers stored as received (client-side encrypted)
 * - No PII in logs or responses
 * - Email used for delivery only, not identity
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { hashEmail } from '../../lib/crypto.ts';
import { increment } from '../../lib/metrics.ts';

// Request validation schema
const ResponseSchema = z.object({
  email: z.string().email(),
  answers: z.record(z.string(), z.unknown()),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // Parse request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const parsed = ResponseSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid request format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { email, answers } = parsed.data;

    try {
      // Hash email immediately - plaintext exists only in this scope
      // gupta-vidya: decrypt -> hash -> discard
      const emailHash = await hashEmail(email);

      // Store with hashed email
      const result = await withConnection(async (client) => {
        const { rows } = await client.queryObject<{
          id: number;
          email_hash: string;
          created_at: Date;
        }>(
          `INSERT INTO fresh_responses (email_hash, answers)
           VALUES ($1, $2)
           RETURNING id, email_hash, created_at`,
          [emailHash, JSON.stringify(answers)]
        );
        return rows[0];
      });

      increment('questionnaire.completed');

      // Response contains only non-identifying data
      return new Response(
        JSON.stringify({
          id: result.id,
          created_at: result.created_at.toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[responses] Submission failed');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Submission failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

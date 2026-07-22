/**
 * Commissions Endpoint
 *
 * POST /api/commissions
 * - No authentication. Commissions are first-contact — the sender has no
 *   account. Access control is by IP rate limit only.
 * - Payload is opaque browser-encrypted ciphertext plus an algorithm tag.
 *   The server never sees plaintext and never decrypts.
 * - Designed to be called cross-origin (e.g. from
 *   https://fobdongle.com/commission.html), so CORS is wide open and no
 *   credentials are involved.
 *
 * gupta-vidya compliance:
 * - No sender identity is captured server-side. If the sender wants to
 *   include contact info they put it inside the encrypted body.
 * - IP is used only for rate-limit bucketing and is never persisted.
 * - Ciphertext is stored verbatim; the response echoes nothing back.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { storeCommission } from '../../lib/commissions.ts';
import { checkRateLimit, clientIp } from '../../lib/rate-limit.ts';
import { increment } from '../../lib/metrics.ts';

const MAX_ALGORITHM = 64;
const MAX_CIPHERTEXT = 200_000;

const CommissionSchema = z.object({
  algorithm: z.string().min(1).max(MAX_ALGORITHM),
  ciphertext: z.string().min(1).max(MAX_CIPHERTEXT),
});

const corsBase = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const corsHeaders = {
      ...corsBase,
      'Content-Type': 'application/json',
    };

    // Rate limit before any parsing so floods can't burn CPU on JSON decode.
    const ip = clientIp(req);
    const rl = checkRateLimit('commissions', ip);
    if (!rl.allowed) {
      increment('errors.4xx');
      increment('commissions.rate_limited');
      return new Response(
        JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Retry-After': String(rl.retryAfterSec),
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const parsed = CommissionSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'algorithm and ciphertext are required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      await storeCommission(parsed.data);
      increment('commissions.received');
      console.log(`[commissions] stored (alg=${parsed.data.algorithm})`);

      return new Response(
        JSON.stringify({ success: true, message: 'Commission received.' }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': String(rl.remaining),
          },
        },
      );
    } catch (error) {
      const errType = error instanceof Error ? error.name : 'Unknown';
      console.error('[commissions] insert failed:', errType);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process commission' }),
        { status: 500, headers: corsHeaders },
      );
    }
  },

  OPTIONS(_req, _ctx) {
    return new Response(null, { status: 204, headers: corsBase });
  },
};

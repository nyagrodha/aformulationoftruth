/**
 * Authenticated Messages Endpoint
 *
 * POST /api/messages
 * - Requires a valid jwt cookie (same one set after magic-link verify).
 * - The sender's identity is taken from the verified JWT payload's
 *   email_hash; clients cannot spoof it.
 * - Body / optional name are age-encrypted under the 'messages' recipient
 *   and stored in contact_messages.
 *
 * gupta-vidya compliance:
 * - Message body is never logged.
 * - Sender identity is the same SHA-256 email hash used elsewhere in fresh_*.
 * - No response echoes back submitted data.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { storeMessage } from '../../lib/messages.ts';
import { verifyQuestionnaireJWT } from '../../lib/jwt.ts';
import { increment } from '../../lib/metrics.ts';

const MessageSchema = z.object({
  name: z.string().max(200).optional(),
  body: z.string().min(1).max(20000),
  // Forward-compat: when user-to-user lands, the client picks a recipient.
  // For now, anything supplied is ignored and the row is stored with
  // recipient_email_hash = NULL (operator).
  recipientEmailHash: z.string().length(64).regex(/^[0-9a-f]+$/).optional(),
});

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const corsBase = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const corsHeaders = {
      ...corsBase,
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Content-Type': 'application/json',
    };

    const jwtToken = getCookie(req.headers.get('Cookie'), 'jwt');
    if (!jwtToken) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const payload = await verifyQuestionnaireJWT(jwtToken);
    if (!payload) {
      increment('errors.4xx');
      increment('auth.messages.invalid_jwt');
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: corsHeaders },
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

    const parsed = MessageSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Message body required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      const result = await storeMessage({
        senderEmailHash: payload.email_hash,
        // Forward-compat: groundwork only — no user directory yet, so any
        // client-supplied recipient is dropped and the row routes to the
        // operator. Wire this back up when per-user keypairs ship.
        recipientEmailHash: undefined,
        name: parsed.data.name,
        body: parsed.data.body,
      });

      if (!result.ok) {
        increment('errors.4xx');
        return new Response(
          JSON.stringify({ success: false, error: 'Message could not be accepted.' }),
          { status: 400, headers: corsHeaders },
        );
      }

      increment('messages.received');
      console.log('[messages] stored');

      return new Response(
        JSON.stringify({ success: true, message: 'Message received.' }),
        { status: 200, headers: corsHeaders },
      );
    } catch (error) {
      const errType = error instanceof Error ? error.name : 'Unknown';
      console.error('[messages] insert failed:', errType);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process message' }),
        { status: 500, headers: corsHeaders },
      );
    }
  },

  OPTIONS(req, _ctx) {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsBase,
        'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      },
    });
  },
};

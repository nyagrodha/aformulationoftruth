/**
 * Contact Form Endpoint
 *
 * POST /api/contact
 * - Accepts an inbound message (optional name, optional reply-to, required body).
 * - Age-encrypts each field under the 'messages' recipient and stores in
 *   contact_messages. No plaintext touches the database or logs.
 *
 * gupta-vidya compliance:
 * - Message body is never logged.
 * - Reply-to email is validated + normalized before encryption.
 * - No response echoes back submitted data.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { storeMessage } from '../../lib/messages.ts';
import { increment } from '../../lib/metrics.ts';

const ContactSchema = z.object({
  name: z.string().max(200).optional(),
  replyTo: z.string().max(320).optional(),
  body: z.string().min(1).max(20000),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

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

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Message body required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      const result = await storeMessage(parsed.data);

      if (!result.ok) {
        increment('errors.4xx');
        const msg = result.reason === 'invalid_reply_to'
          ? 'Please provide a valid reply-to address or leave it blank.'
          : 'Message could not be accepted.';
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 400, headers: corsHeaders },
        );
      }

      increment('messages.received');
      console.log('[contact] message stored');

      return new Response(
        JSON.stringify({ success: true, message: 'Message received.' }),
        { status: 200, headers: corsHeaders },
      );
    } catch (error) {
      const errType = error instanceof Error ? error.name : 'Unknown';
      console.error('[contact] insert failed:', errType);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process message' }),
        { status: 500, headers: corsHeaders },
      );
    }
  },

  OPTIONS(_req, _ctx) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  },
};

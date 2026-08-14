/**
 * Contact form submission endpoint.
 *
 * POST /api/contact
 *   body: { message: string, pgpEncrypted: boolean }
 *
 * - Always age-encrypted server-side to CONTACT_AGE_RECIPIENT (dedicated,
 *   not the gate's age key).
 * - If pgpEncrypted=true, the inbound message must be a PGP armored block
 *   (the client encrypted it to the admin's contact PGP key before sending).
 *   Server treats it as opaque text and still wraps in age.
 * - If CONTACT_AGE_RECIPIENT is unset, returns 503; no silent fallback.
 * - In-memory per-IP rate limit: 5 / hour. No persisted IP state.
 *
 * gupta-vidya compliance: no PII column, no logging of message body, no
 * echoing of the message in the response.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { ContactRecipientNotConfiguredError, storeContactMessage } from '../../lib/contact.ts';
import { increment } from '../../lib/metrics.ts';

const ContactSchema = z.object({
  message: z.string().min(1).max(10000),
  pgpEncrypted: z.boolean(),
});

const PGP_BEGIN = '-----BEGIN PGP MESSAGE-----';
const PGP_END = '-----END PGP MESSAGE-----';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface IpBucket {
  windowStart: number;
  count: number;
}

const rateLimitState = new Map<string, IpBucket>();

/**
 * Returns ms until the IP can submit again, or 0 if it's under the limit.
 * Mutates the bucket as a side effect of the check.
 */
function rateLimitCheck(ip: string): number {
  const now = Date.now();
  const bucket = rateLimitState.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(ip, { windowStart: now, count: 1 });
    return 0;
  }

  if (bucket.count < RATE_LIMIT_MAX) {
    bucket.count += 1;
    return 0;
  }

  const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart);
  return Math.max(retryAfterMs, 1000);
}

function getClientIp(req: Request, remoteHost: string | undefined): string {
  const trustProxy = Deno.env.get('TRUST_PROXY') === 'true';
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return remoteHost || 'unknown';
}

function corsHeaders(req: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export const handler: Handlers = {
  async POST(req, ctx) {
    increment('requests.api');
    const headers = corsHeaders(req);

    // Rate limit by IP. Done before body parse so flood attempts pay less work.
    const remoteHost = (ctx as { remoteAddr?: { hostname?: string } }).remoteAddr?.hostname;
    const ip = getClientIp(req, remoteHost);
    const retryAfterMs = rateLimitCheck(ip);
    if (retryAfterMs > 0) {
      increment('errors.4xx');
      increment('contact.rate_limited');
      return new Response(
        JSON.stringify({ success: false, error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
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
        { status: 400, headers },
      );
    }

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request format' }),
        { status: 400, headers },
      );
    }

    const message = parsed.data.message.trim();
    if (message.length === 0) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers },
      );
    }

    const { pgpEncrypted } = parsed.data;

    // Envelope sanity: if the client said PGP, it must actually be PGP.
    // Catches a silent client-side encryption failure that would otherwise
    // leak plaintext through a path the user thought was sealed.
    if (pgpEncrypted) {
      if (!message.startsWith(PGP_BEGIN) || !message.trimEnd().endsWith(PGP_END)) {
        increment('errors.4xx');
        increment('contact.pgp_envelope_invalid');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Message marked as PGP but is not a PGP armored block',
          }),
          { status: 400, headers },
        );
      }
    }

    try {
      await storeContactMessage({ message, pgpInner: pgpEncrypted });
      increment('contact.received');
      if (pgpEncrypted) increment('contact.received.pgp');

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers },
      );
    } catch (error) {
      if (error instanceof ContactRecipientNotConfiguredError) {
        increment('errors.5xx');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Secure contact channel is not configured yet',
          }),
          { status: 503, headers },
        );
      }
      console.error('[contact] Failed to store message');
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send message' }),
        { status: 500, headers },
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

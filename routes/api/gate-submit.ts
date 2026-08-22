/**
 * Combined Gate Submit + Magic Link Endpoint
 *
 * POST /api/gate-submit
 * - Accepts email and gate answers in a single request
 * - Generates gateToken server-side
 * - Stores gate answers
 * - Creates and sends magic link
 *
 * gupta-vidya compliance:
 * - Email used for delivery only, immediately hashed
 * - Gate token is random, unlinkable
 * - All processing happens server-side
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { createMagicLink } from '../../lib/auth.ts';
import { hashEmail } from '../../lib/crypto.ts';
import { findActiveSession, markLinkSent, mayResend, startOrResumeSession } from '../../lib/questionnaire-session.ts';
import { jwtCookie } from '../../lib/session-auth.ts';
import { verifyAddressDeliverable } from '../../lib/email-address.ts';
import { createQuestionnaireJWT } from '../../lib/jwt.ts';
import { increment, trackFunnelQuestion } from '../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../lib/email.ts';
import { GATE_QUESTIONS, storeEncryptedAnswer } from '../../lib/gate_encrypt.ts';
import { ageEncryptTo } from '../../lib/age-encrypt.ts';
import {
  breakglassRecipient,
  generateSessionKeypair,
  IdentityPushFailed,
  pushIdentity,
  shredRemoteIdentity,
} from '../../lib/session-keys.ts';

const GateSubmitSchema = z.object({
  email: z.string().email(),
  answer1: z.string().max(20000).optional().default(''),
  answer2: z.string().max(20000).optional().default(''),
});

/**
 * Read the submission body from either a native HTML form
 * (application/x-www-form-urlencoded / multipart) or a JSON fetch.
 * The landing-page gate form posts urlencoded with no JS; SPA/island
 * clients post JSON. Returns null if the body can't be parsed.
 */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return await req.json();
    }
    // form-urlencoded or multipart/form-data
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') obj[key] = value;
    }
    return obj;
  } catch {
    return null;
  }
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // Native form posts want an HTML redirect; JSON clients want JSON.
    const wantsJson = (req.headers.get('content-type') || '').includes('application/json') ||
      (req.headers.get('accept') || '').includes('application/json');

    const fail = (status: number, error: string, redirectError: string) => {
      if (wantsJson) {
        return new Response(
          JSON.stringify({ error }),
          { status, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // No-JS form path: bounce back to the gate with an error flag (no PII in URL).
      return new Response(null, {
        status: 303,
        headers: { Location: `/?error=${redirectError}#begin` },
      });
    };

    const body = await readBody(req);
    if (body === null) {
      increment('errors.4xx');
      return fail(400, 'Invalid request body', 'invalid');
    }

    const parsed = GateSubmitSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return fail(400, 'Valid email required', 'email');
    }

    const { email, answer1, answer2 } = parsed.data;

    // Zod confirms the address is well-formed; this asks whether anything is
    // listening at the other end. It matters more than it used to: since the
    // gate began admitting people straight into the questionnaire, a mistyped
    // domain means the link that would bring them back goes nowhere and their
    // place quietly lapses when the 24-hour token does.
    //
    // Deliverability only -- never who the provider is. Throwaway and
    // privacy-focused addresses are welcome here and cock.li and maildrop.cc
    // are recommended by name on the front page. See lib/email-address.ts.
    const address = await verifyAddressDeliverable(email);
    if (!address.ok) {
      increment('errors.4xx');
      return fail(
        400,
        address.reason === 'syntax'
          ? 'That address does not look like an address.'
          : 'That domain does not appear to accept mail. Check the spelling, or use another address.',
        'email',
      );
    }

    try {
      // Step 0: Who is this address, and does it already have a questionnaire?
      //
      // Hashed up here rather than halfway down, because the answer decides
      // almost everything that follows. Anyone can type anyone's address into
      // this form -- nothing has been proved at this point -- so a submission
      // naming an address that ALREADY has an unfinished session is treated as
      // a request to resend that session's link, and nothing else. It does not
      // provision a key, does not write a gate row, does not overwrite the
      // answers already stored, and above all does not set cookies. The link
      // goes to the address; whoever asked for it gains nothing unless they can
      // read that mailbox.
      //
      // A brand-new address has no one to harm, so it is let straight in.
      const emailHash = await hashEmail(email);
      const existing = await findActiveSession(emailHash);

      if (existing) {
        increment('funnel.gate.resend');

        // Cooldown before rotating again. Each resend mints a new resume token
        // and invalidates whatever one is in a browser, and the request is
        // unproven -- anybody can type this address. Inside the window the
        // honest answer is that a working link was already sent, because one
        // was: it lasts 24 hours and can be opened as often as needed.
        if (!await mayResend(emailHash)) {
          increment('funnel.gate.resend_throttled');
          if (!wantsJson) {
            return new Response(null, { status: 303, headers: { Location: '/check-email' } });
          }
          return new Response(
            JSON.stringify({ message: 'A link was sent recently and is still valid', resumed: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const { opaqueToken, sessionId } = await startOrResumeSession(emailHash);
        const jwt = await createQuestionnaireJWT(emailHash, sessionId, 'link');
        const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
        const resendUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;

        const resend = await sendMagicLinkEmail(email, resendUrl);
        if (!resend.success) {
          console.error('[gate-submit] Resend delivery failed');
          increment('errors.email');
          return fail(500, 'Failed to send your link. Please try again.', 'send');
        }
        increment('auth.magiclink.sent');
        await markLinkSent(sessionId);

        if (!wantsJson) {
          return new Response(null, { status: 303, headers: { Location: '/check-email' } });
        }
        return new Response(
          JSON.stringify({ message: 'Link sent', resumed: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Step 1: Generate server-side gate token
      const gateToken = crypto.randomUUID();

      // Step 1b: Provision this session's keypair BEFORE anything is stored.
      //
      // break-glass is read first because it is local and throws when
      // unconfigured; doing it after the push would strand a key on the key box
      // for a submission we then refuse over a missing env var.
      //
      // Fails closed: a session whose identity never reached the key box is one
      // whose PDF could never be produced, so storing its answers would be
      // storing an unreadable orphan.
      let recipients: string[];
      let pushed = false;
      try {
        const breakglass = breakglassRecipient();
        const keypair = await generateSessionKeypair();
        await pushIdentity(gateToken, keypair.identity);
        pushed = true;
        recipients = [keypair.recipient, breakglass];
      } catch (e) {
        // An ambiguous failure may still have left a key behind: ssh is killed
        // at its deadline and `cat > file` can produce a complete or truncated
        // key indistinguishably from here. Withdraw before refusing.
        if (e instanceof IdentityPushFailed && e.ambiguous) {
          await shredRemoteIdentity(gateToken);
        }
        console.error('[gate-submit] Session key provisioning failed; submission refused');
        increment('errors.5xx');
        return fail(503, 'Unable to securely store your answers right now. Please try again.', 'server');
      }

      const q0 = answer1.trim();
      const q1 = answer2.trim();

      // Ordering note. Everything below is arranged so the one step that CANNOT
      // be undone happens last. The Rust gate exposes /api/store and no delete,
      // so once an answer is written there it stays; the Postgres row and the
      // pushed identity can both be withdrawn. Writing answers first — as this
      // route used to — meant a later failure left ciphertext behind for a
      // session that was refused and has no key.
      try {
        // The Postgres row carries the session's PUBLIC key and the address
        // encrypted to it. Neither is readable here: this process holds
        // recipients, never identities.
        const encryptedEmail = await ageEncryptTo(email, recipients);

        await withConnection(async (client) => {
          await client.queryObject(
            `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer, session_pubkey, encrypted_email)
             VALUES ($1, NULL, NULL, $2, $3)`,
            [gateToken, recipients[0], encryptedEmail],
          );
        });

        // Last, and unrecoverable. Encrypted to this session's key plus
        // break-glass rather than the gate's global recipient. The plaintext
        // columns q0_answer/q1_answer stay NULL — nothing reads them, and
        // storing plaintext would break the promise the gate form makes.
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionIndex: 0,
          questionText: GATE_QUESTIONS[0],
          answer: q0,
          skipped: q0.length === 0,
          recipients,
        });
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionIndex: 1,
          questionText: GATE_QUESTIONS[1],
          answer: q1,
          skipped: q1.length === 0,
          recipients,
        });

        // Funnel steps, counted only once the answers are actually stored.
        // trackFunnelQuestion() has existed since the funnel was written and
        // had no caller anywhere, so every step after 'gate viewed' reported 0
        // forever -- which read as total drop-off at the first question on a
        // gate that was in fact converting.
        trackFunnelQuestion(0);
        trackFunnelQuestion(1);
        increment('funnel.gate.email_entered');
      } catch {
        // Unwind what can be unwound. Best-effort: we are already refusing the
        // submission and must not fail differently because cleanup failed.
        if (pushed) await shredRemoteIdentity(gateToken);
        await withConnection(async (client) => {
          await client.queryObject('DELETE FROM fresh_gate_responses WHERE gate_token = $1', [gateToken]);
        }).catch(() => {});

        // Category only — the thrown error is never logged, it could carry text.
        console.error('[gate-submit] Gate encryption unavailable; submission refused');
        increment('errors.5xx');
        return fail(503, 'Unable to securely store your answers right now. Please try again.', 'server');
      }

      console.log('[gate-submit] Gate answers encrypted and stored');

      // Step 3: Create magic link
      const { token: magicToken, expiresAt } = await createMagicLink(email);

      // Step 4b: If this entry began at a wearable's QR (/w/:token planted
      // the cookie), record the encounter -- pseudonymous, hash only.
      // Silent rate cap per token (no oracle for abusers); failures never
      // block the gate flow.
      try {
        const cookieHeader = req.headers.get('Cookie') || '';
        const wMatch = cookieHeader.match(/(?:^|;\s*)wearable_token=([A-Za-z0-9_-]{16,64})/);
        if (wMatch) {
          const wearableToken = wMatch[1];
          await withConnection(async (client) => {
            const cap = await client.queryObject<{ n: bigint }>(
              `SELECT COUNT(*)::bigint AS n FROM fresh_encounters
                WHERE wearable_token = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
              [wearableToken],
            );
            if (Number(cap.rows[0]?.n ?? 0) < 20) {
              await client.queryObject(
                `INSERT INTO fresh_encounters (wearable_token, scanner_email_hash)
                 VALUES ($1, $2)`,
                [wearableToken, emailHash],
              );
            }
          });
          console.log('[gate-submit] Encounter recorded');
        }
      } catch (encounterErr) {
        console.error('[gate-submit] Encounter recording failed (non-fatal):', encounterErr);
      }

      // Step 5: Create or resume the questionnaire session with gateToken.
      // These used to be two branches that did the same thing in both arms.
      const { opaqueToken, sessionId } = await startOrResumeSession(emailHash, gateToken);

      // Step 6: Create JWT.
      //
      // via: 'gate' -- this person typed an address and was believed. It is
      // enough to answer questions with, and deliberately not enough to have a
      // copy posted anywhere; /api/responses/deliver requires the 'link'
      // claim, which only clicking the emailed link can produce.
      const jwt = await createQuestionnaireJWT(emailHash, sessionId, 'gate');

      // Step 7: Build the link. It is now the way BACK -- to another device, or
      // to this one after the cookies are gone -- rather than the way in.
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const magicLinkUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;

      // Step 8: Send it. Failure here is no longer fatal.
      //
      // This used to return 500 and turn the respondent away, having already
      // stored their two answers and provisioned a key -- so a momentary SMTP
      // fault cost the site the person AND kept what they had written. Now they
      // are already going to the first question; the mail is a convenience they
      // can do without for this sitting, and they can ask for it again by
      // entering the same address.
      const emailResult = await sendMagicLinkEmail(email, magicLinkUrl);
      if (emailResult.success) {
        increment('auth.magiclink.sent');
        await markLinkSent(sessionId);
        console.log('[gate-submit] Magic link sent, expires:', expiresAt.toISOString());
      } else {
        // Status only — the error may carry the recipient address (CLAUDE.md).
        console.error('[gate-submit] Email delivery failed; admitting anyway');
        increment('errors.email');
      }

      increment('questionnaire.started');

      // Step 9: Put them in the questionnaire, here, now.
      //
      // The email round trip used to sit between the gate and the first
      // question, and it is where this site lost nearly everyone: of the clicks
      // that came back at all, roughly half landed on an error page, and the
      // ones that never came back cannot be counted. Answering starts in the
      // same tab, on the same gesture that submitted the gate.
      // ONLY the 24-hour jwt cookie. Not the resume token -- see
      // resumeCookie() in lib/session-auth.ts. Setting both here would let
      // anyone who typed a stranger's address delete the jwt cookie, reload,
      // and have the resume token mint a `via: 'link'` JWT for them, which is
      // the exact claim that authorises the site to post a PDF to that
      // address. The durable credential is delivered by email, through the
      // mailbox, which is the only thing that proves anything.
      //
      // The cost is that a respondent who never opens the email has 24 hours
      // rather than 30 days. That is the correct trade: the 30 days is a
      // promise about an address, and until the link is opened nobody has
      // shown the address is theirs.
      const headers = new Headers();
      headers.append('Set-Cookie', jwtCookie(jwt));
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

      if (!wantsJson) {
        headers.set('Location', '/questionnaire');
        return new Response(null, { status: 303, headers });
      }

      headers.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          message: 'Questionnaire started',
          next: '/questionnaire',
          emailSent: emailResult.success,
          expiresAt: expiresAt.toISOString(),
        }),
        { status: 200, headers },
      );
    } catch {
      // Category only. The error object can carry the submitted answers or the
      // email address, so it is never logged (CLAUDE.md: zero-logging).
      console.error('[gate-submit] Submission failed');
      increment('errors.5xx');

      return fail(500, 'Failed to process submission', 'server');
    }
  },
};

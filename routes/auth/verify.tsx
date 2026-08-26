/**
 * Magic Link Verification Page - WITH JWT + OPAQUE RESUME TOKEN
 *
 * GET /auth/verify?token=<JWT>&resume=<opaque_token>
 *
 * Verifies JWT and resume token, then redirects to questionnaire.
 * Tokens are stored in cookies and should be copied to localStorage by client.
 *
 * Flow:
 * 1. Extract JWT and resume token from URL
 * 2. Verify JWT signature and expiration
 * 3. Hash resume token to get session_id
 * 4. Verify session_id matches JWT payload
 * 5. Verify session exists and is active
 * 6. Set cookies and redirect to /questionnaire
 * 7. Client copies tokens to localStorage
 *
 * gupta-vidya compliance:
 * - NO email in URL
 * - Tokens are opaque and unlinkable
 * - Resume token requires server secret to decode
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import { createQuestionnaireJWT, verifyQuestionnaireJWT } from '../../lib/jwt.ts';
import { hashResumeToken } from '../../lib/crypto.ts';
import { getSessionRecord, markSessionVerified } from '../../lib/questionnaire-session.ts';
import { increment } from '../../lib/metrics.ts';
import { sessionCookieHeaders } from '../../lib/session-auth.ts';
import { markMagicLinkOpened } from '../../lib/auth.ts';

interface VerifyData {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export const handler: Handlers<VerifyData> = {
  async GET(req, ctx) {
    const requestId = crypto.randomUUID();
    increment('requests.api');

    const url = new URL(req.url);
    const jwtToken = url.searchParams.get('token');
    const resumeToken = url.searchParams.get('resume');

    // Validate presence of both tokens
    if (!jwtToken || !resumeToken) {
      increment('errors.4xx');
      console.warn(`[auth:${requestId}] Missing tokens: jwt=${!!jwtToken}, resume=${!!resumeToken}`);
      return ctx.render({
        success: false,
        error: 'Missing authentication parameters',
        errorCode: 'MISSING_TOKENS',
      });
    }

    try {
      // Step 1: Verify JWT
      const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
      if (!jwtPayload) {
        increment('errors.4xx');
        increment('auth.verify.invalid_jwt');
        console.warn(`[auth:${requestId}] Invalid JWT`);
        return ctx.render({
          success: false,
          error: 'Invalid or expired authentication token',
          errorCode: 'INVALID_JWT',
        });
      }

      // Step 2: Hash resume token to get session_id
      const sessionId = await hashResumeToken(resumeToken);

      // Step 3: Verify session_id matches JWT payload
      if (sessionId !== jwtPayload.session_id) {
        increment('errors.4xx');
        increment('auth.verify.token_mismatch');
        console.warn(`[auth:${requestId}] Token mismatch: hash=${sessionId}, jwt=${jwtPayload.session_id}`);
        return ctx.render({
          success: false,
          error: 'Authentication tokens do not match',
          errorCode: 'TOKEN_MISMATCH',
        });
      }

      // Step 4: Verify the session exists. Deliberately getSessionRecord and
      // not getSessionById: a finished session's link must keep working, because
      // that link is how someone comes back to collect the copy the completion
      // page offers them.
      const session = await getSessionRecord(sessionId);
      if (!session) {
        increment('errors.4xx');
        increment('auth.verify.session_not_found');
        // Category only. This used to interpolate the session id, which
        // /var/www/CLAUDE.md names outright in its forbidden list -- the
        // pre-commit hook does not catch template literals like that one.
        console.warn(`[auth:${requestId}] Session not found`);
        return ctx.render({
          success: false,
          error: 'Session not found or expired',
          errorCode: 'SESSION_NOT_FOUND',
        });
      }

      // Step 5: Verify email hash matches (additional security check)
      if (session.emailHash !== jwtPayload.email_hash) {
        increment('errors.4xx');
        increment('auth.verify.email_mismatch');
        console.warn(`[auth:${requestId}] Email hash mismatch`);
        return ctx.render({
          success: false,
          error: 'Authentication verification failed',
          errorCode: 'EMAIL_MISMATCH',
        });
      }

      // Success! Set cookies and redirect
      increment('auth.magiclink.verified');

      // Record that a link was actually opened. Nothing did this before: the
      // used_at column was written only when a NEWER link superseded an older
      // one, so the report's "Magic links opened" figure was a count of
      // resubmissions -- 1,180 of them, against 1,183 repeat sessions. It has
      // never once measured someone clicking a link.
      await markMagicLinkOpened(jwtPayload.email_hash);

      // Durable proof that somebody can read mail at this address. The `via`
      // claim below authorises THIS request; this records it for good, which is
      // what keeps an unverified session from squatting an address forever.
      await markSessionVerified(sessionId);

      // A FRESH token rather than the one from the URL, carrying via: 'link'.
      // The URL token was minted at the gate, before anyone had proved they
      // could read mail at this address; clicking the link is that proof, and
      // this is where it gets recorded. /api/responses/deliver requires it
      // before it will post anything to anyone.
      const sessionJwt = await createQuestionnaireJWT(jwtPayload.email_hash, sessionId, 'link');

      const headers = new Headers();
      for (const cookie of sessionCookieHeaders(sessionJwt, resumeToken)) {
        headers.append('Set-Cookie', cookie);
      }

      // Redirect to questionnaire
      headers.set('Location', '/questionnaire');
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      headers.set('X-Request-ID', requestId);

      console.log(`[auth:${requestId}] Verification successful, redirecting to questionnaire`);

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      console.error(`[auth:${requestId}] Verification failed:`, error);
      increment('errors.5xx');
      return ctx.render({
        success: false,
        error: 'Verification failed. Please try requesting a new magic link.',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  },
};

export default function VerifyPage({ data }: PageProps<VerifyData>) {
  if (data.success) {
    return (
      <div>
        <p>Redirecting...</p>
      </div>
    );
  }

  return (
    <html>
      <head>
        <title>Verification Failed</title>
        <style>
          {`
          body {
            font-family: Georgia, serif;
            background: #0c0720;
            color: #d7ccff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          h1 { color: #ff6b6b; }
          a {
            color: #ffd56b;
            text-decoration: none;
          }
          a:hover { text-decoration: underline; }
        `}
        </style>
      </head>
      <body>
        <div class='container'>
          <h1>Verification Failed</h1>
          <p>{data.error || 'An error occurred'}</p>
          <p>
            {
              /*
              This pointed at /login, which is a dead end in two ways: the form
              there has no method and no action, so without JavaScript the
              button does nothing at all; and when it does run it submits an
              empty gate token, producing a session with no keypair, a
              35-question order, and no way ever to be sent a copy. 66 people
              reached this page in a day and a half and that was the only exit
              offered them. /#begin is the live gate.
            */
            }
            <a href='/#begin'>Begin again</a>
          </p>
        </div>
      </body>
    </html>
  );
}

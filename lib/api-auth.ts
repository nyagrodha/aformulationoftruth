/**
 * The gate every authenticated write in the messaging surface passes through.
 *
 * Three things have to be true, and they were previously spread across whichever
 * handler remembered them. routes/api/profile.ts hand-rolls its own cookie
 * parsing and checks none of this; routes/api/questions/answer.ts invented a
 * header scheme no browser can satisfy and returned 401 to every real request
 * for the life of the feature. Both are what a per-route auth check decays into.
 *
 *   1. SAME ORIGIN. SameSite=Lax sends cookies on a top-level navigation, so a
 *      form on another site can post here with the session attached. See
 *      lib/csrf.ts.
 *
 *   2. PROVEN ADDRESS. authenticateRequest reports `via`: 'gate' means someone
 *      typed an address into the gate, 'link' means they opened what was mailed
 *      to it. Only the second proves control. Without this, anyone types any
 *      address and gets a fresh identity for free -- and messaging attributes
 *      what they write to that identity in front of somebody else.
 *      routes/api/responses/deliver.ts:189 already gates on it; this is the same
 *      rule, factored out.
 *
 *   3. THE REFRESHED JWT IS RETURNED TO THE CALLER. When authentication runs off
 *      the resume token, a new JWT is minted and the caller must set it as a
 *      cookie or every subsequent request pays the same database round trip.
 *      Handlers forget; this makes it a value they have to pass through.
 *
 * Zero-logging: nothing here logs a cookie, a hash or a token. Refusals are
 * counted by category, matching lib/session-auth.ts.
 */

import { authenticateRequest, isAuthenticated, jwtCookie } from './session-auth.ts';
import { checkSameOrigin, csrfRefusal } from './csrf.ts';
import { increment } from './metrics.ts';

export interface ApiCaller {
  emailHash: string;
  sessionId: string;
  /** Set on the response when present, or the next request re-authenticates. */
  refreshedJwt?: string;
}

/** JSON response helper, carrying a refreshed cookie when one was minted. */
export function json(body: unknown, status = 200, caller?: ApiCaller): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (caller?.refreshedJwt) headers.append('Set-Cookie', jwtCookie(caller.refreshedJwt));
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Resolve the caller, or produce the refusal to return.
 *
 * @returns the caller, or a Response to send back untouched
 */
export async function requireProvenCaller(req: Request): Promise<ApiCaller | Response> {
  if (checkSameOrigin(req) !== null) return csrfRefusal();

  const proof = await authenticateRequest(req);

  if (!isAuthenticated(proof)) {
    increment('messenger.denied.unauthenticated');
    return json({ error: 'Sign in to use messages.' }, 401);
  }

  if (proof.via !== 'link') {
    // Deliberately distinguishable from a plain 401: the person IS signed in,
    // and telling them to check their mail is the only way they get past this.
    increment('messenger.denied.unproven');
    return json({
      error: 'Open the link sent to your address to confirm it, then try again.',
    }, 403);
  }

  return {
    emailHash: proof.session.emailHash,
    sessionId: proof.session.sessionId,
    refreshedJwt: proof.refreshedJwt,
  };
}

export function isRefusal(result: ApiCaller | Response): result is Response {
  return result instanceof Response;
}

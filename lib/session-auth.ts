/**
 * One way to answer "who is this request, and may they use this session".
 *
 * Six routes each had their own copy of parse-the-cookie, verify-the-JWT,
 * look-up-the-session, and they had drifted: some redirected on failure, some
 * rendered, one checked a header instead of a cookie, and none of them ever
 * looked at the resume_token cookie. That last omission is why the
 * questionnaire's own promise -- "Your place is kept for thirty days from your
 * last visit" -- was not true. The cookie was set with a thirty-day Max-Age and
 * then read by nothing that could act on it, so the real limit was the JWT's 24
 * hours, after which /questionnaire redirected to the landing page without a
 * word. 399 arrivals were turned away that way in the retained logs, against
 * 299 that saw a question.
 *
 * The order here is deliberate: JWT first because it is cheap and carries the
 * `via` claim, resume token second because it is the durable credential. A
 * request holding only the resume token gets a fresh JWT minted for it, which
 * the caller must set -- see refreshedJwt.
 *
 * Zero-logging: nothing in this file logs a token, a session id, an address, or
 * a hash of one. Failures are counted by category and nothing else.
 */

import { createQuestionnaireJWT, verifyQuestionnaireJWT } from './jwt.ts';
import { getSessionByToken, getSessionRecord, type QuestionnaireSession } from './questionnaire-session.ts';
import { increment } from './metrics.ts';

/** Why authentication produced nothing. Category names only -- see the header. */
export type AuthFailure =
  /** No jwt and no resume_token cookie: a cold browser, or cookies refused. */
  | 'nocookie'
  /** Credentials present but no longer valid -- expired JWT, rotated token. */
  | 'expired'
  /** Credentials verified, but the session they name is not in the database. */
  | 'notfound';

export interface SessionAuth {
  session: QuestionnaireSession;
  /**
   * How this request proved itself, taken from the JWT's claim or, when the
   * resume token did the work, from the token itself -- which is delivered by
   * email and therefore proves control of the address exactly as a link does.
   */
  via: 'gate' | 'link';
  /**
   * Set when a JWT had to be minted during this request, because the caller
   * arrived with only a resume token. The caller MUST put it in a cookie or the
   * next request will pay the same database round-trip again.
   */
  refreshedJwt?: string;
}

export function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve the session behind a request, refreshing its JWT from the resume
 * token when necessary.
 *
 * Returns the session whether or not it has finished. Callers that need an
 * ANSWERABLE session must check `session.completedAt` themselves -- and should
 * send a finished one to /completion rather than treating it as a failure.
 *
 * @returns The session and how it was proved, or a category describing why not
 */
export async function authenticateRequest(
  req: Request,
): Promise<SessionAuth | { failure: AuthFailure }> {
  const cookies = req.headers.get('Cookie');
  const jwtToken = getCookie(cookies, 'jwt');
  const resumeToken = getCookie(cookies, 'resume_token');

  if (!jwtToken && !resumeToken) {
    increment('auth.session.nocookie');
    return { failure: 'nocookie' };
  }

  if (jwtToken) {
    const payload = await verifyQuestionnaireJWT(jwtToken);
    if (payload) {
      const session = await getSessionRecord(payload.session_id);
      if (session) {
        return { session, via: payload.via ?? 'link' };
      }
      // A valid signature naming a session that is not there. Before migration
      // 012 this was routine rather than exceptional: submitting the gate again
      // stamped the older session completed, and every reader filtered those
      // out, so the link already in the inbox authenticated perfectly and then
      // found nothing. Sessions are no longer replaced, so this now means a row
      // that was genuinely deleted.
      increment('auth.session.notfound');
      return { failure: 'notfound' };
    }
  }

  // Either there was no JWT or it had expired. The resume token outlives it by
  // design -- thirty days against twenty-four hours -- and this is the only
  // place in the app where that difference has ever been redeemable.
  //
  // Minting 'link' here is sound ONLY because a resume token cannot be obtained
  // without reading mail at the address: /auth/verify is the sole route that
  // sets the cookie, and it is reached by opening the emailed link. See
  // resumeCookie() for why /api/gate-submit must never set it -- when it did,
  // deleting the jwt cookie was enough to upgrade a merely-typed address to a
  // proven one.
  if (resumeToken) {
    const session = await getSessionByToken(resumeToken);
    if (session) {
      const refreshedJwt = await createQuestionnaireJWT(session.emailHash, session.sessionId, 'link');
      increment('auth.resume.redeemed');
      return { session, via: 'link', refreshedJwt };
    }
    increment('auth.resume.stale');
    return { failure: 'expired' };
  }

  increment('auth.session.expired');
  return { failure: 'expired' };
}

/** Narrowing helper, so callers read as prose rather than as property tests. */
export function isAuthenticated(
  result: SessionAuth | { failure: AuthFailure },
): result is SessionAuth {
  return 'session' in result;
}

/**
 * Cookie flags, in one place.
 *
 * `Secure` is conditional. /auth/verify hardcoded it, which is harmless there
 * because that route is only ever reached over https from an email, but the
 * same header sent from the gate on http://localhost:8000 would be dropped
 * silently by the browser and the whole flow would die in development with no
 * error anywhere.
 */
function cookieOptions(): string {
  const baseUrl = Deno.env.get('BASE_URL') || '';
  const isProd = Deno.env.get('DENO_ENV') === 'production' || Deno.env.get('NODE_ENV') === 'production';
  const secure = (baseUrl.startsWith('https:') || isProd) ? '; Secure' : '';
  return `HttpOnly${secure}; SameSite=Lax; Path=/`;
}

/**
 * The short-lived credential. 24 hours, matching the JWT's own validity, so the
 * cookie and the token it carries expire together rather than the cookie
 * outliving a token that is already dead.
 *
 * Safe to issue to someone who has only typed an address, because the `via`
 * claim inside it records that that is all they did.
 */
export function jwtCookie(jwt: string): string {
  return `jwt=${jwt}; ${cookieOptions()}; Max-Age=86400`;
}

/**
 * The durable credential. 30 days, matching cleanupExpiredSessions and the
 * promise the questionnaire page makes to the respondent.
 *
 * MUST only ever be set on a response to someone who has opened the emailed
 * link -- that is, from /auth/verify and nowhere else. The invariant is
 * load-bearing and is what makes authenticateRequest's `via: 'link'` sound:
 * possession of a resume token is treated as proof of control of the address,
 * because the only way to come by one is to read mail sent there.
 *
 * /api/gate-submit deliberately does NOT set this. It once did, alongside a
 * `via: 'gate'` JWT, and that combination was a one-step bypass of the whole
 * scheme: type a stranger's address at the gate, delete the jwt cookie,
 * reload, and the resume token minted a 'link' JWT -- after which the site
 * would post a PDF to an address nobody had proved they could read. Anyone
 * adding a second caller here is reopening that hole.
 */
export function resumeCookie(opaqueToken: string): string {
  return `resume_token=${opaqueToken}; ${cookieOptions()}; Max-Age=2592000`;
}

/**
 * Both credentials, for the one route entitled to grant them: /auth/verify.
 */
export function sessionCookieHeaders(jwt: string, opaqueToken: string): string[] {
  return [jwtCookie(jwt), resumeCookie(opaqueToken)];
}

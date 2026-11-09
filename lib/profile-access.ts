/**
 * Who is asking, for the profile pages.
 *
 * The profile pages used to hand-roll jwt -> verify -> getSessionById, and
 * getSessionById drops sessions whose questionnaire is finished. The only link
 * into the profile flow is on /completion, so every person who followed it had
 * a finished session and was redirected to the landing page. This uses
 * authenticateRequest, which returns the session finished or not and redeems
 * the 30-day resume token when the 24-hour JWT has lapsed.
 *
 * Writes need a PROVEN address (via 'link'): profiles are keyed by email_hash,
 * so someone who had merely typed an address at the gate could otherwise create
 * or overwrite the profile of whoever owns it. Viewing the form only needs a
 * session, so an unproven visitor is told to open their link rather than being
 * bounced without a word.
 *
 * Zero-logging: nothing here logs. Outcomes are counted by category.
 */

import { authenticateRequest, isAuthenticated, jwtCookie } from './session-auth.ts';
import { increment } from './metrics.ts';

export type ProfileAccess =
  | { kind: 'owner'; emailHash: string; refreshedJwt?: string }
  | { kind: 'unproven'; refreshedJwt?: string }
  | { kind: 'guest' };

export async function profileAccess(req: Request): Promise<ProfileAccess> {
  const proof = await authenticateRequest(req);
  if (!isAuthenticated(proof)) {
    increment('profile.access.guest');
    return { kind: 'guest' };
  }
  if (proof.via !== 'link') {
    increment('profile.access.unproven');
    return { kind: 'unproven', refreshedJwt: proof.refreshedJwt };
  }
  return { kind: 'owner', emailHash: proof.session.emailHash, refreshedJwt: proof.refreshedJwt };
}

/** Attach a JWT minted during this request, or the next one re-authenticates. */
export function withRefreshedJwt(response: Response, refreshedJwt?: string): Response {
  if (refreshedJwt) response.headers.append('Set-Cookie', jwtCookie(refreshedJwt));
  return response;
}

/** The profile pages carry a session; never let a cache keep a copy. */
export function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

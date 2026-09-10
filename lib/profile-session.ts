/**
 * Who may create or edit a profile.
 *
 * The questionnaire session is the identity. After the last answer,
 * completeSession() stamps completed_at, and getSessionById() treats that as
 * "no session". Profile create is the next step on that same walk, so it must
 * use getSessionRecord() — the row, finished or not.
 *
 * Owner is always the session's email_hash, never a value from the body.
 */

import { verifyQuestionnaireJWT } from './jwt.ts';
import { getSessionRecord } from './questionnaire-session.ts';

export interface ProfileIdentity {
  emailHash: string;
  sessionId: string;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function identityFromRequest(req: Request): Promise<ProfileIdentity | null> {
  const jwtToken = getCookie(req.headers.get('Cookie'), 'jwt');
  if (!jwtToken) return null;

  const payload = await verifyQuestionnaireJWT(jwtToken);
  if (!payload) return null;

  const session = await getSessionRecord(payload.session_id);
  if (!session) return null;

  return { emailHash: session.emailHash, sessionId: session.sessionId };
}

/**
 * Brooch encounter page
 *
 * GET /e/:code
 *
 * A brooch shows a fresh HMAC-signed code per QR (format A4OT-ENC1). A code
 * honoured here is one encounter: recorded by its hash, attributed to the
 * brooch's wearer, and carried to gate-submit by the `encounter` cookie. The
 * page itself is the same invitation /w/ shows.
 *
 * Privacy: every refusal (malformed, forged, stale, revoked, no KEK) is the
 * same 404 /w/ gives an unknown token; nothing is logged but metrics.
 *
 * Spec: ~/Projects/ESP32/brooch/docs/superpowers/specs/2026-09-23-encounter-identity-design.md
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import WearableInvitation, { type WearableInvitationProps } from '../../components/WearableInvitation.tsx';
import { acceptEncounter } from '../../lib/brooch.ts';
import { CODE_RE } from '../../lib/brooch_code.ts';
import { greetingFor } from '../../lib/greeting.ts';
import { encounterCookie, loadWearable, wearableCookie } from '../../lib/wearable.ts';

/** Test seam for the accept step. */
export const brooch: { accept: typeof acceptEncounter } = { accept: acceptEncounter };

export const handler: Handlers<WearableInvitationProps> = {
  async GET(req, ctx) {
    const code = ctx.params.code;
    if (!CODE_RE.test(code)) return ctx.renderNotFound();

    const accepted = await brooch.accept(code);
    if (!accepted) return ctx.renderNotFound();
    const data = await loadWearable(accepted.wearableToken);
    if (!data) return ctx.renderNotFound();

    // Never logged (see lib/greeting.ts and CLAUDE.md's Zero-Logging Policy).
    const greeting = greetingFor(req.headers.get('Accept-Language'));
    const resp = await ctx.render({ ...data, greeting });
    resp.headers.append('Set-Cookie', wearableCookie(accepted.wearableToken));
    resp.headers.append('Set-Cookie', encounterCookie(accepted.codeHash));
    return resp;
  },
};

export default function EncounterPage({ data }: PageProps<WearableInvitationProps>) {
  return <WearableInvitation {...data} />;
}

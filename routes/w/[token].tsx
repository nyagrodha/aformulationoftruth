/**
 * Wearable invitation page
 *
 * GET /w/:token
 *
 * The QR on a wearable (or coffee-table) object points here. The page
 * greets the scanner using a language chosen from Accept-Language
 * (lib/greeting.ts), never the owner's display_name, which is loaded but
 * not shown (task 5g). It states the reciprocity enticement when the owner
 * has elected it, and leads into the site's normal entry ritual (the gate).
 * The wearable token is planted as an HttpOnly cookie; gate-submit records
 * the encounter when the scanner leaves their email.
 *
 * Privacy: unknown tokens 404 like any other page (no oracle); the URL
 * names no one; nothing is collected here.
 *
 * Spec: docs/superpowers/specs/2026-07-25-wearable-encounters-design.md
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import WearableInvitation, { type WearableInvitationProps } from '../../components/WearableInvitation.tsx';
import { greetingFor } from '../../lib/greeting.ts';
import { loadWearable, wearableCookie } from '../../lib/wearable.ts';

export const handler: Handlers<WearableInvitationProps> = {
  async GET(req, ctx) {
    const token = ctx.params.token;
    // Opaque tokens are URL-safe random; anything else is a fast 404.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      return ctx.renderNotFound();
    }
    const data = await loadWearable(token);
    if (!data) return ctx.renderNotFound();

    // Never logged (see lib/greeting.ts and CLAUDE.md's Zero-Logging Policy).
    const greeting = greetingFor(req.headers.get('Accept-Language'));
    const resp = await ctx.render({ ...data, greeting });
    resp.headers.append('Set-Cookie', wearableCookie(token));
    return resp;
  },
};

export default function WearablePage({ data }: PageProps<WearableInvitationProps>) {
  return <WearableInvitation {...data} />;
}

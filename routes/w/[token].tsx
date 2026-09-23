/**
 * Wearable invitation page
 *
 * GET /w/:token
 *
 * The QR on a wearable (or coffee-table) object points here. The page
 * greets the scanner in the owner's chosen voice (display_name, or the
 * site's own voice when NULL), states the reciprocity enticement when the
 * owner has elected it, and leads into the site's normal entry ritual
 * (the gate). The wearable token is planted as an HttpOnly cookie;
 * gate-submit records the encounter when the scanner leaves their email.
 *
 * Privacy: unknown tokens 404 like any other page (no oracle); the URL
 * names no one; nothing is collected here.
 *
 * Spec: docs/superpowers/specs/2026-07-25-wearable-encounters-design.md
 */

import { Handlers, PageProps } from '$fresh/server.ts';
import WearableInvitation from '../../components/WearableInvitation.tsx';
import { loadWearable, wearableCookie, type WearableData } from '../../lib/wearable.ts';

export const handler: Handlers<WearableData> = {
  async GET(_req, ctx) {
    const token = ctx.params.token;
    // Opaque tokens are URL-safe random; anything else is a fast 404.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      return ctx.renderNotFound();
    }
    const data = await loadWearable(token);
    if (!data) return ctx.renderNotFound();

    const resp = await ctx.render(data);
    resp.headers.append('Set-Cookie', wearableCookie(token));
    return resp;
  },
};

export default function WearablePage({ data }: PageProps<WearableData>) {
  return <WearableInvitation {...data} />;
}

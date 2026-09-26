/**
 * /mesh — the wall's first address, now /loramesh. Kept as a permanent
 * redirect: the bridge's question text and DMs carried /mesh before the
 * rename, and whatever a radio already said cannot be taken back.
 */
import { Handlers } from '$fresh/server.ts';

export const handler: Handlers = {
  GET() {
    return new Response(null, { status: 301, headers: { Location: '/loramesh' } });
  },
};

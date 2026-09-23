/**
 * /4m — alias of the landing prolegomenon.
 *
 * This URL used to be served by Caddy from a hand-copied static dump at
 * public/4m/index.html, which silently went stale the moment the real page
 * changed. It re-exports the index route instead, so /4m and / can never drift
 * apart again.
 *
 * The stale dump itself (public/4m/index.html, reachable only at the literal
 * URL /4m/index.html -- distinct from /4m and /4m/, both of which already
 * landed here) was deleted in task 5c: nothing in the codebase linked to it,
 * and its only effect was to keep serving the frozen copy this comment
 * already warned about. /4m/index.html now falls through to the site's 404,
 * same as any other unmatched path.
 */

export { default, handler } from './index.tsx';

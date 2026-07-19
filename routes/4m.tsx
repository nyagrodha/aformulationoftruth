/**
 * /4m — alias of the landing prolegomenon.
 *
 * This URL used to be served by Caddy from a hand-copied static dump at
 * public/4m/index.html, which silently went stale the moment the real page
 * changed. It re-exports the index route instead, so /4m and / can never drift
 * apart again.
 */

export { default, handler } from './index.tsx';

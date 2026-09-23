/**
 * GET /zcash.html
 *
 * Was a static file (`public/zcash.html`, `ctx.destination === 'static'`),
 * which routes/_middleware.ts's visit counter never sees -- see
 * lib/static-page.ts's header for why this moved. Same URL, only what serves
 * it changed.
 */
import { servePage } from '../lib/static-page.ts';

export const handler = servePage('pages/zcash.html');

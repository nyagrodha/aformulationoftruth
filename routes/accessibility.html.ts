/**
 * GET /accessibility.html
 *
 * Was a static file (`public/accessibility.html`, `ctx.destination ===
 * 'static'`), which routes/_middleware.ts's visit counter never sees -- see
 * lib/static-page.ts's header for why this moved. Links to it (its own nav,
 * routes/privacy.tsx, components/*) are untouched: the URL is the same, only
 * what serves it changed.
 */
import { servePage } from '../lib/static-page.ts';

export const handler = servePage('pages/accessibility.html');

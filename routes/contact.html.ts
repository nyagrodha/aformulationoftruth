/**
 * GET /contact.html
 *
 * Was a static file (`public/contact.html`, `ctx.destination === 'static'`),
 * which routes/_middleware.ts's visit counter never sees -- see
 * lib/static-page.ts's header for why this moved. The ten `href="/contact.html"`
 * links across the site (components/PageShell.tsx, components/SiteFooter.tsx,
 * routes/gate.tsx, and others) are untouched: the URL is the same, only what
 * serves it changed.
 */
import { servePage } from '../lib/static-page.ts';

export const handler = servePage('pages/contact.html');

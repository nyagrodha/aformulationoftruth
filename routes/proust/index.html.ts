/**
 * GET /proust/index.html
 *
 * Was a static file (`public/proust/index.html`, `ctx.destination ===
 * 'static'`), which routes/_middleware.ts's visit counter never sees -- see
 * lib/static-page.ts's header for why this moved. Its stylesheet
 * (public/proust/css/proust.css) stayed put, since only the HTML moved --
 * the page's `<link href="/css/proust.css">` (repo-root-relative) is
 * unaffected either way.
 */
import { servePage } from '../../lib/static-page.ts';

export const handler = servePage('pages/proust/index.html');

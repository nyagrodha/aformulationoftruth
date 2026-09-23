/**
 * GET /showmenotell/index.html
 *
 * Was a static file (`public/showmenotell/index.html`, `ctx.destination ===
 * 'static'`), which routes/_middleware.ts's visit counter never sees -- see
 * lib/static-page.ts's header for why this moved. public/showmenotell/css/
 * stayed put -- only the HTML moved.
 */
import { servePage } from '../../lib/static-page.ts';

export const handler = servePage('pages/showmenotell/index.html');

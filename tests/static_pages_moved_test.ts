/**
 * Task 5c: the pages moved out of public/ (contact.html, accessibility.html,
 * zcash.html, proust/index.html, showmenotell/index.html) must not still be
 * reachable there. If a static copy lingered, it would shadow the new route
 * again -- Fresh's router checks static files before page routes (a request
 * for an exact static path always wins over a pattern route), so a leftover
 * `public/contact.html` would silently serve the old, uncounted static
 * response even though routes/contact.html.ts now exists.
 *
 * A glob, not five separate stat calls, so this also catches the accidental
 * case of a *new* .html file dropped into public/ that happens to collide
 * with a route name later -- see routes/about_test.tsx's single-file version
 * of this same check for the prior (about.html) migration.
 */
import { assertEquals } from '$std/assert/mod.ts';
import { expandGlob } from '$std/fs/expand_glob.ts';

const MOVED = new Set([
  'public/contact.html',
  'public/accessibility.html',
  'public/zcash.html',
  'public/proust/index.html',
  'public/showmenotell/index.html',
]);

Deno.test('none of the pages moved to pages/ are still served from public/', async () => {
  const found: string[] = [];
  for await (const entry of expandGlob('public/**/*.html')) {
    const rel = entry.path.slice(entry.path.indexOf('public/'));
    if (MOVED.has(rel)) found.push(rel);
  }
  assertEquals(found, []);
});

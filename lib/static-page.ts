/**
 * Serve one of the pages moved out of `public/` into `pages/` byte for byte.
 *
 * Task 5c (audit F13): `public/` is served by Fresh as static files
 * (`ctx.destination === 'static'`), which the Task 5b visit rule never
 * counts (routes/_middleware.ts only looks at `'route'`). Moving the HTML out
 * of `public/` and into a route -- via this helper -- is what makes a real
 * visit to one of these pages countable, without rewriting the page itself:
 * the file's bytes go out unchanged, only the thing serving them changes.
 *
 * The file is read once, at module load (`Deno.readFileSync` at the top of
 * the calling route module, via this function), and kept in a closure --
 * never re-read per request. That is deliberate: these pages are static
 * content, checked into git, so there is nothing to gain by re-reading the
 * disk on every hit, and it keeps the byte-for-byte guarantee trivial to
 * reason about (the test compares against the very same read).
 */

import { Handlers } from '$fresh/server.ts';

/** A GET/HEAD-only handler that always returns the same bytes, verbatim. */
export function servePage(path: string): Handlers {
  const body = Deno.readFileSync(path);
  return {
    GET: () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  };
}

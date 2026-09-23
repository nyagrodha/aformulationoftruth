/**
 * Task 5c: the alternate URL forms these pages had as static files, pinned
 * against Fresh's real router -- `createHandler` builds the same in-process
 * fetch handler `main.ts` serves, from the same manifest and config, without
 * opening a socket (no `Deno.serve`/`startServer` call in this path) or
 * touching the network.
 *
 * `routes/*_test.ts` (the hermetic, stand-in-`ctx` style used elsewhere in
 * this repo) proves each new route returns the moved file byte for byte; it
 * cannot prove what happens at a *different* URL, because there is no route
 * at that URL to call a handler on -- the answer depends on Fresh's own
 * static-exact-match and trailing-slash rules, not on anything this task
 * wrote. This file exists to pin those, once, against the real router
 * instead of reasoning about them from source.
 *
 * Every non-200 status below is unchanged from before this task: Fresh's
 * static file server has never resolved `/dir` or `/dir/` to a `dir/index.html`
 * it holds only under its exact, literal path (src/server/router.ts,
 * `getParamsAndRoute`: static routes are matched by string equality, not
 * pattern), and `trailingSlash` is not enabled in fresh.config.ts, so a
 * trailing slash is 307'd to the bare path first (src/server/context.ts). The
 * one status that DID change on purpose is `/4m/index.html`: see
 * routes/4m.tsx's header for why the stale dump it used to serve was deleted.
 */
import { assertEquals } from '$std/assert/mod.ts';
import { createHandler } from '$fresh/server.ts';
import config from '../fresh.config.ts';
import manifest from '../fresh.gen.ts';

async function status(handler: Awaited<ReturnType<typeof createHandler>>, path: string) {
  const res = await handler(new Request(`http://localhost${path}`));
  await res.body?.cancel();
  return { status: res.status, location: res.headers.get('location') };
}

Deno.test('the pages moved to routes still answer at their pre-existing URLs', async () => {
  const handler = await createHandler(manifest, config);

  // The canonical URL of each moved page: 200, unchanged.
  assertEquals((await status(handler, '/contact.html')).status, 200);
  assertEquals((await status(handler, '/accessibility.html')).status, 200);
  assertEquals((await status(handler, '/zcash.html')).status, 200);
  assertEquals((await status(handler, '/proust/index.html')).status, 200);
  assertEquals((await status(handler, '/showmenotell/index.html')).status, 200);

  // Directory-style forms were never served (no implicit index.html
  // resolution in Fresh) and still are not -- no regression, no new coverage.
  assertEquals(await status(handler, '/proust'), { status: 404, location: null });
  assertEquals(await status(handler, '/proust/'), { status: 307, location: '/proust' });
  assertEquals(await status(handler, '/showmenotell'), { status: 404, location: null });
  assertEquals(await status(handler, '/showmenotell/'), { status: 307, location: '/showmenotell' });
});

Deno.test('/4m special case: the real route is untouched, the stale dump is gone', async () => {
  const handler = await createHandler(manifest, config);

  // Unchanged: routes/4m.tsx re-exports index.tsx; /4m/ 307s to it.
  assertEquals((await status(handler, '/4m')).status, 200);
  assertEquals(await status(handler, '/4m/'), { status: 307, location: '/4m' });

  // Changed on purpose: public/4m/index.html (the stale hand-copied dump) was
  // deleted, since nothing linked to it and it only ever shadowed nothing --
  // it fell through to no route, not to routes/4m.tsx. It now 404s instead of
  // silently serving frozen content.
  assertEquals((await status(handler, '/4m/index.html')).status, 404);
});

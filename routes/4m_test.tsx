/**
 * /4m used to be a hand-copied static dump at public/4m/index.html. The dump
 * went stale the moment the landing page changed. The route now re-exports
 * index.tsx so the two URLs cannot drift. Identity, not output: a fork that
 * still rendered alike would not be caught by matching HTML.
 *
 * Modelled on messenger_test.tsx's /encrypted-messenger alias assertion.
 *
 *   deno test --allow-read routes/4m_test.tsx
 */

import { assertEquals } from '$std/assert/mod.ts';
import IndexPage, { handler as indexHandler } from './index.tsx';
import FourMPage, { handler as fourMHandler } from './4m.tsx';

Deno.test('/4m is the landing page, not a second copy', () => {
  assertEquals(FourMPage, IndexPage);
  assertEquals(fourMHandler, indexHandler);
});

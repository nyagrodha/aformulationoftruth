/**
 * Pins the loopback bind (task 5b, audit F2): the app must listen only on
 * 127.0.0.1, so nothing can reach :7268 around Caddy and forge
 * X-Forwarded-For -- see lib/client-ip.ts's header comment on why a forged
 * XFF is a forged identity, not just a forged address.
 *
 *   deno test --allow-env --allow-read fresh_config_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import config from './fresh.config.ts';

Deno.test('the server binds to loopback only', () => {
  assertEquals(config.server?.hostname, '127.0.0.1');
});

Deno.test('PORT handling is unaffected by the bind', () => {
  // defineConfig is the identity function (fresh's config.ts), so this reads
  // whatever fresh.config.ts computed at import time from PORT/default 8000.
  assertEquals(typeof config.server?.port, 'number');
  assertEquals(Number.isFinite(config.server?.port), true);
});

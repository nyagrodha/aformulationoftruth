/**
 * Pins the loopback bind (task 5b, audit F2): the app must listen only on
 * 127.0.0.1, so nothing can reach :7268 around Caddy and forge
 * X-Forwarded-For -- see lib/client-ip.ts's header comment on why a forged
 * XFF is a forged identity, not just a forged address.
 *
 * Task 5f: BIND_HOST env var allows LAN development override when unset (RED/GREEN test).
 *
 *   deno test --allow-env --allow-read fresh_config_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import config from './fresh.config.ts';

Deno.test('the server binds to loopback only (BIND_HOST unset)', () => {
  assertEquals(config.server?.hostname, '127.0.0.1');
});

Deno.test('PORT handling is unaffected by the bind', () => {
  // defineConfig is the identity function (fresh's config.ts), so this reads
  // whatever fresh.config.ts computed at import time from PORT/default 8000.
  assertEquals(typeof config.server?.port, 'number');
  assertEquals(Number.isFinite(config.server?.port), true);
});

Deno.test('BIND_HOST=0.0.0.0 overrides the loopback bind for LAN dev', async () => {
  // Save the original env var so we can restore it
  const originalBindHost = Deno.env.get('BIND_HOST');

  try {
    // Set BIND_HOST to 0.0.0.0 for LAN development
    Deno.env.set('BIND_HOST', '0.0.0.0');

    // Cache-busting import: use a unique query param to force re-evaluation
    // since modules are cached at import time and read env vars only then.
    const bustId = crypto.randomUUID();
    const devConfig = await import(`./fresh.config.ts?bind=${bustId}`);

    assertEquals(devConfig.default.server?.hostname, '0.0.0.0');
  } finally {
    // Restore the original env var
    if (originalBindHost !== undefined) {
      Deno.env.set('BIND_HOST', originalBindHost);
    } else {
      Deno.env.delete('BIND_HOST');
    }
  }
});

Deno.test("BIND_HOST='' (empty) falls back to loopback", async () => {
  // Save the original env var so we can restore it
  const originalBindHost = Deno.env.get('BIND_HOST');

  try {
    // Set BIND_HOST to empty string (stray blank .env line scenario)
    Deno.env.set('BIND_HOST', '');

    // Cache-busting import: use a unique query param to force re-evaluation
    const bustId = crypto.randomUUID();
    const devConfig = await import(`./fresh.config.ts?bind=${bustId}`);

    // Empty BIND_HOST should fall back to loopback default, not bind to ''
    assertEquals(devConfig.default.server?.hostname, '127.0.0.1');
  } finally {
    // Restore the original env var
    if (originalBindHost !== undefined) {
      Deno.env.set('BIND_HOST', originalBindHost);
    } else {
      Deno.env.delete('BIND_HOST');
    }
  }
});

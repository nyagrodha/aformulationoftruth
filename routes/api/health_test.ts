/**
 * Health check fail-closed when the database is not configured.
 *
 *   deno test --allow-env --allow-read routes/api/health_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './health.ts';

Deno.test('health - an unconfigured database is degraded, not a false ok', async () => {
  const saved = {
    DATABASE_URL: Deno.env.get('DATABASE_URL'),
    PGHOST: Deno.env.get('PGHOST'),
    PGDATABASE: Deno.env.get('PGDATABASE'),
    PGUSER: Deno.env.get('PGUSER'),
    PGPASSWORD: Deno.env.get('PGPASSWORD'),
  };
  for (const key of Object.keys(saved)) Deno.env.delete(key);
  try {
    const res = await handler.GET!(new Request('http://localhost/api/health'), {} as never);
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.status, 'degraded');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

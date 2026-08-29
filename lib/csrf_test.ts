import { assertEquals } from '$std/assert/mod.ts';
import { checkSameOrigin, isSameOrigin } from './csrf.ts';

/*
 * These set BASE_URL per case rather than once, because lib/csrf.ts reads it on
 * every call by design -- main.ts loads .env after the route manifest imports,
 * so a module-level read would see nothing and cache it. A test that set it once
 * at the top would pass against an implementation with that bug.
 */
function withBaseUrl<T>(value: string | null, fn: () => T): T {
  const previous = Deno.env.get('BASE_URL');
  if (value === null) Deno.env.delete('BASE_URL');
  else Deno.env.set('BASE_URL', value);
  try {
    return fn();
  } finally {
    if (previous === undefined) Deno.env.delete('BASE_URL');
    else Deno.env.set('BASE_URL', previous);
  }
}

const SITE = 'https://aformulationoftruth.com';

function post(headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/messenger/send`, { method: 'POST', headers });
}

Deno.test('a same-origin POST is allowed', () => {
  withBaseUrl(SITE, () => {
    assertEquals(checkSameOrigin(post({ Origin: SITE })), null);
  });
});

Deno.test('a cross-origin POST is refused', () => {
  withBaseUrl(SITE, () => {
    assertEquals(checkSameOrigin(post({ Origin: 'https://evil.example' })), 'mismatch');
  });
});

/*
 * The attack this exists for. SameSite=Lax withholds cookies from cross-site
 * subresource requests but SENDS them on a top-level navigation, and a form
 * posting from another origin is a top-level navigation.
 */
Deno.test('a POST with no Origin at all is refused, not assumed friendly', () => {
  withBaseUrl(SITE, () => {
    assertEquals(checkSameOrigin(post()), 'missing');
  });
});

Deno.test('Referer stands in for a missing Origin, and only when it matches', () => {
  withBaseUrl(SITE, () => {
    assertEquals(checkSameOrigin(post({ Referer: `${SITE}/messages` })), null);
    assertEquals(checkSameOrigin(post({ Referer: 'https://evil.example/x' })), 'mismatch');
    assertEquals(checkSameOrigin(post({ Referer: 'not a url' })), 'mismatch');
  });
});

/*
 * Fail closed. An unconfigured BASE_URL must not silently disable the check --
 * lib/age-encrypt.ts records what a missing-variable fallback already cost.
 */
Deno.test('an unconfigured BASE_URL refuses rather than waving requests through', () => {
  withBaseUrl(null, () => {
    assertEquals(checkSameOrigin(post({ Origin: SITE })), 'unconfigured');
  });
  withBaseUrl('not a url', () => {
    assertEquals(checkSameOrigin(post({ Origin: SITE })), 'unconfigured');
  });
});

Deno.test('safe methods pass untouched', () => {
  withBaseUrl(SITE, () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = new Request(`${SITE}/api/messenger/threads`, { method });
      assertEquals(checkSameOrigin(req), null, `${method} should not be guarded`);
    }
  });
});

Deno.test('every state-changing method is guarded, not only POST', () => {
  withBaseUrl(SITE, () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const req = new Request(`${SITE}/api/x`, { method, headers: { Origin: 'https://evil.example' } });
      assertEquals(checkSameOrigin(req), 'mismatch', `${method} should be guarded`);
    }
  });
});

Deno.test('isSameOrigin reads as the boolean the callers want', () => {
  withBaseUrl(SITE, () => {
    assertEquals(isSameOrigin(post({ Origin: SITE })), true);
    assertEquals(isSameOrigin(post({ Origin: 'https://evil.example' })), false);
  });
});

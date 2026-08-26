/**
 * The resume token is proof of address control. Guard the one thing that makes
 * that true.
 *
 * /api/responses/deliver will post a PDF to the address on a session, and it
 * only does so for a JWT carrying `via: 'link'`. authenticateRequest mints that
 * claim for anyone holding a valid resume_token cookie -- which is sound only
 * because the sole way to come by one is to open a link sent to the address.
 *
 * That invariant was briefly broken. /api/gate-submit, when it began admitting
 * new addresses straight into the questionnaire, set BOTH cookies: a
 * `via: 'gate'` JWT and the durable resume token. Deleting the jwt cookie and
 * reloading was then enough to have the resume token mint a `via: 'link'` JWT,
 * so anyone could type a stranger's address and make the site mail them a PDF.
 * The whole point of the claim was undone by one cookie.
 *
 * These tests are deliberately source-level. The property being protected is
 * "no route other than /auth/verify may set this cookie", which is a statement
 * about the codebase rather than about any single response, and a behavioural
 * test would only cover the route that happened to be exercised.
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { jwtCookie, resumeCookie, sessionCookieHeaders } from '../lib/session-auth.ts';

const ROOT = new URL('../', import.meta.url).pathname;

/**
 * Comments stripped before scanning. The rule is about what the code DOES, and
 * the routes that must not call these helpers are precisely the ones most
 * likely to explain in prose why they must not -- which a naive substring scan
 * would then read as a violation.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every route file, so a new one cannot quietly opt out of the rule. */
async function routeFiles(): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('_test.')) {
        found.push(path);
      }
    }
  }
  await walk(`${ROOT}routes`);
  return found;
}

Deno.test({
  name: 'resume cookie - only /auth/verify may grant the durable credential',
  async fn() {
    const offenders: string[] = [];
    for (const path of await routeFiles()) {
      const source = stripComments(await Deno.readTextFile(path));
      const grants = source.includes('resumeCookie(') || source.includes('sessionCookieHeaders(');
      if (grants && !path.endsWith('routes/auth/verify.tsx')) {
        offenders.push(path.replace(ROOT, ''));
      }
    }

    assertEquals(
      offenders,
      [],
      'These routes set the resume_token cookie. Only /auth/verify may, because ' +
        'possession of a resume token is what authenticateRequest treats as proof ' +
        'that the address belongs to the holder. See resumeCookie() in lib/session-auth.ts.',
    );
  },
});

Deno.test({
  name: 'resume cookie - /api/gate-submit grants only the short-lived credential',
  async fn() {
    const source = stripComments(await Deno.readTextFile(`${ROOT}routes/api/gate-submit.ts`));

    // It must still let a new address in -- that is the change this guards.
    assertStringIncludes(source, 'jwtCookie(');
    assert(
      !source.includes('resumeCookie(') && !source.includes('sessionCookieHeaders('),
      'gate-submit must not issue a resume token: nobody has proved the address at that point.',
    );
  },
});

Deno.test({
  name: 'resume cookie - /auth/verify still grants both, or resuming is impossible',
  async fn() {
    const source = stripComments(await Deno.readTextFile(`${ROOT}routes/auth/verify.tsx`));
    assertStringIncludes(
      source,
      'sessionCookieHeaders(',
      'If verify stops setting the resume token, nothing sets it and the ' +
        'thirty-day resume promise becomes unkeepable again.',
    );
  },
});

Deno.test({
  name: 'cookie builders - jwtCookie carries no resume token, and vice versa',
  fn() {
    const jwt = jwtCookie('header.payload.signature');
    assertStringIncludes(jwt, 'jwt=header.payload.signature');
    assertStringIncludes(jwt, 'Max-Age=86400');
    assertStringIncludes(jwt, 'HttpOnly');
    assertStringIncludes(jwt, 'SameSite=Lax');
    assert(!jwt.includes('resume_token'), 'the short-lived cookie must not smuggle the durable one');

    const resume = resumeCookie('opaque-token-value');
    assertStringIncludes(resume, 'resume_token=opaque-token-value');
    assertStringIncludes(resume, 'Max-Age=2592000');
    assert(!resume.startsWith('jwt='));

    const both = sessionCookieHeaders('a.b.c', 'opaque');
    assertEquals(both.length, 2);
    assertEquals(both[0], jwtCookie('a.b.c'));
    assertEquals(both[1], resumeCookie('opaque'));
  },
});

Deno.test({
  name: 'cookie builders - Secure tracks the scheme rather than being hardcoded',
  fn() {
    const base = Deno.env.get('BASE_URL');
    const denoEnv = Deno.env.get('DENO_ENV');
    const nodeEnv = Deno.env.get('NODE_ENV');
    // Both must be cleared: either one alone forces Secure on regardless of scheme.
    Deno.env.delete('DENO_ENV');
    Deno.env.delete('NODE_ENV');
    try {
      Deno.env.set('BASE_URL', 'http://localhost:8000');
      assert(
        !jwtCookie('a.b.c').includes('Secure'),
        'a Secure cookie over plain http is dropped silently, which kills the whole flow in development',
      );

      Deno.env.set('BASE_URL', 'https://aformulationoftruth.com');
      assertStringIncludes(jwtCookie('a.b.c'), '; Secure');
    } finally {
      if (base === undefined) Deno.env.delete('BASE_URL');
      else Deno.env.set('BASE_URL', base);
      if (denoEnv !== undefined) Deno.env.set('DENO_ENV', denoEnv);
      if (nodeEnv !== undefined) Deno.env.set('NODE_ENV', nodeEnv);
    }
  },
});

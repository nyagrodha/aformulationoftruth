/**
 * User throughput walk — a mock run through the app AS WIRED.
 *
 * Drives the real HTTP journey a browser makes, from the prolegomenon landing
 * page to an encrypted submission and a completed profile, asserting the
 * transport-time invariant at every hop: the server never echoes the plaintext
 * email or answer text back to the client, and the emailed magic link carries
 * no address.
 *
 * This test MUTATES a live database and calls the Rust gate, so it is opt-in:
 *
 *   THROUGHPUT_LIVE=1 BASE_URL=http://localhost:7268 \
 *     deno test --allow-net --allow-env tests/throughput/journey_test.ts
 *
 * Prerequisites for a green run:
 *   - Fresh app running (deno task start) on BASE_URL
 *   - Rust gate reachable at GATE_URL (else gate-submit fails closed with 503)
 *   - DENO_ENV != 'production' (so /api/auth/magic-link returns the _dev* tokens
 *     this walk uses in place of clicking a real emailed link)
 *
 * Without THROUGHPUT_LIVE=1, or if the stack is unreachable, every step is
 * skipped (not failed) so the suite stays green in CI without infrastructure.
 * The offline invariant checks live in encryption_audit_test.ts.
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const LIVE = Deno.env.get('THROUGHPUT_LIVE') === '1';
const BASE_URL = (Deno.env.get('BASE_URL') ?? 'http://localhost:7268').replace(/\/$/, '');

async function canReach(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    await res.body?.cancel();
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const reachable = LIVE ? await canReach(BASE_URL) : false;
const skip = !LIVE || !reachable;

if (!LIVE) {
  console.warn('[throughput] skipping live walk — set THROUGHPUT_LIVE=1 with a running stack to enable.');
} else if (!reachable) {
  console.warn(`[throughput] skipping live walk — ${BASE_URL} is unreachable (start the Fresh app first).`);
}

/** Minimal cookie jar: collects Set-Cookie across the redirect chain. */
class CookieJar {
  private jar = new Map<string, string>();
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name: string): string | undefined {
    return this.jar.get(name);
  }
}

Deno.test({
  name: 'throughput: prolegomenon → encrypted submission → questionnaire → completion → profile',
  ignore: skip,
  async fn(t) {
    const jar = new CookieJar();
    const nonce = crypto.randomUUID();
    const email = `throughput+${nonce}@example.invalid`;
    // Distinctive sentinels so we can prove answer text never surfaces in any
    // response body (it should only ever exist age-encrypted inside the gate).
    const answer1 = `perfect-happiness-sentinel-${nonce}`;
    const answer2 = `greatest-fear-sentinel-${nonce}`;
    const sentinels = [email, answer1, answer2];

    /** Assert a response body leaks none of the plaintext PII sentinels. */
    const assertNoLeak = (where: string, body: string) => {
      for (const secret of sentinels) {
        assert(
          !body.includes(secret),
          `${where}: response body leaked plaintext PII (${secret.split('-')[0]}…)`,
        );
      }
    };

    await t.step('1. GET / renders the prolegomenon gate form', async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();
      assertEquals(res.status, 200);
      assertStringIncludes(html, 'action="/api/gate-submit"', 'landing form must post to /api/gate-submit');
      assertStringIncludes(html, 'name="answer1"');
      assertStringIncludes(html, 'name="answer2"');
      assertStringIncludes(html, 'name="email"');
    });

    await t.step('2. POST /api/gate-submit age-encrypts answers (or fails closed)', async () => {
      const res = await fetch(`${BASE_URL}/api/gate-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, answer1, answer2 }),
      });
      const body = await res.text();
      assertNoLeak('gate-submit', body);

      if (res.status === 503) {
        // Gate unreachable → fail closed. This is correct behaviour: no plaintext
        // is stored. The rest of the walk needs the gate, so surface it clearly.
        throw new Error(
          'gate-submit returned 503 (Rust gate unreachable). Start the gate at GATE_URL, then re-run.',
        );
      }
      assertEquals(res.status, 200, `expected 200 from gate-submit, got ${res.status}: ${body}`);
      const json = JSON.parse(body);
      assertExistsExpiry(json);
    });

    // The magic link is normally emailed. In non-production the endpoint returns
    // the _dev* tokens so this walk can proceed without an inbox.
    let devJWT = '';
    let devResume = '';

    await t.step('3. POST /api/auth/magic-link issues verification tokens (no email in link)', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.text();
      assertNoLeak('magic-link', body);
      assertEquals(res.status, 200, `expected 200 from magic-link, got ${res.status}: ${body}`);
      const json = JSON.parse(body);

      assert(
        json._devJWT && json._devResume,
        'magic-link must return _dev tokens in non-production (set DENO_ENV != production)',
      );
      devJWT = json._devJWT;
      devResume = json._devResume;

      // Transport-time invariant: the emailed link must not carry the address.
      assert(
        !json._devLink.includes(email) && !json._devLink.includes(encodeURIComponent(email)),
        'magic link URL must not contain the plaintext email',
      );
    });

    await t.step('4. GET /auth/verify sets the jwt + resume_token session cookies', async () => {
      const res = await fetch(
        `${BASE_URL}/auth/verify?token=${encodeURIComponent(devJWT)}&resume=${encodeURIComponent(devResume)}`,
        { redirect: 'manual' },
      );
      await res.body?.cancel();
      jar.absorb(res);

      assertEquals(res.status, 302, 'verify should redirect on success');
      assertEquals(res.headers.get('location'), '/questionnaire');
      assert(jar.get('jwt'), 'verify must set the jwt cookie');
      assert(jar.get('resume_token'), 'verify must set the resume_token cookie');

      // Cookie hardening flags (read from the raw Set-Cookie lines).
      const setCookies = res.headers.getSetCookie().join('\n');
      assertStringIncludes(setCookies, 'HttpOnly', 'session cookies must be HttpOnly');
      assertStringIncludes(setCookies, 'SameSite=Strict', 'session cookies must be SameSite=Strict');
    });

    await t.step('5. Walk the questionnaire to completion', async () => {
      const MAX_STEPS = 40; // 35 questions minus the 2 gate questions, with headroom
      let landedOnCompletion = false;

      for (let i = 0; i < MAX_STEPS; i++) {
        const get = await fetch(`${BASE_URL}/questionnaire`, {
          headers: { Cookie: jar.header() },
          redirect: 'manual',
        });

        if (get.status === 302 && get.headers.get('location') === '/completion') {
          await get.body?.cancel();
          landedOnCompletion = true;
          break;
        }
        const page = await get.text();
        assertEquals(get.status, 200, `unexpected status walking questionnaire at step ${i}: ${get.status}`);
        assertNoLeak(`questionnaire GET #${i}`, page);

        const post = await fetch(`${BASE_URL}/questionnaire`, {
          method: 'POST',
          headers: {
            Cookie: jar.header(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ answer: `walk-answer-${i}`, action: 'continue' }),
          redirect: 'manual',
        });
        await post.body?.cancel();
        assert(
          post.status === 302,
          `questionnaire POST #${i} should redirect (got ${post.status})`,
        );
        if (post.headers.get('location') === '/completion') {
          landedOnCompletion = true;
          break;
        }
      }

      assert(landedOnCompletion, 'questionnaire walk never reached /completion within the step budget');
    });

    await t.step('6. GET /completion renders', async () => {
      const res = await fetch(`${BASE_URL}/completion`, { headers: { Cookie: jar.header() } });
      const body = await res.text();
      assertEquals(res.status, 200);
      assertNoLeak('completion', body);
    });

    await t.step('7. Profile: gated pages load and /api/profile saves', async () => {
      const choice = await fetch(`${BASE_URL}/profile-choice`, {
        headers: { Cookie: jar.header() },
        redirect: 'manual',
      });
      await choice.body?.cancel();
      assertEquals(choice.status, 200, 'profile-choice should load for an authenticated session');

      const create = await fetch(`${BASE_URL}/profile-create`, {
        headers: { Cookie: jar.header() },
        redirect: 'manual',
      });
      await create.body?.cancel();
      assertEquals(create.status, 200, 'profile-create should load for an authenticated session');

      const save = await fetch(`${BASE_URL}/api/profile`, {
        method: 'POST',
        headers: { Cookie: jar.header(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'private',
          acceptsAnonymousMail: false,
          displayName: `walker-${nonce.slice(0, 8)}`,
          bio: 'throughput walk',
          handle: '',
        }),
      });
      const body = await save.text();
      assertEquals(save.status, 200, `profile save should succeed, got ${save.status}: ${body}`);
      assertNoLeak('profile', body);
    });
  },
});

function assertExistsExpiry(json: unknown) {
  assert(
    typeof json === 'object' && json !== null && 'expiresAt' in json,
    'gate-submit success must return an expiresAt',
  );
}

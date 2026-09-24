/**
 * lib/gate-guard.ts, end to end over its real parts: the real image challenge,
 * the real counter logic, with Postgres and DNS stood in for.
 *
 * The stand-in for Postgres is an in-memory map that answers the two INSERT
 * ... RETURNING statements lib/rate-limit.ts issues, so the counting under
 * test is the SQL's semantics, not a mock of the functions.
 *
 *   deno test --allow-env lib/gate-guard_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { answerFor, CAPTCHA_MAX_AGE_SECONDS, issueCaptcha, questionFor, verifyCaptcha } from './captcha.ts';
import { normaliseAnswer, TEXT_CHALLENGE_COUNT, textAnswerMatches, textChallengeFor } from './text-challenge.ts';
import { rateLimitDbForTesting } from './rate-limit.ts';
import { clearMailDomainCache, mailDomainResolverForTesting } from './mail-domain.ts';
import { clientKey, type GuardInput, guardMagicLinkRequest, recordSent } from './gate-guard.ts';

Deno.env.set('JWT_SECRET', 'test-jwt-secret-key');
Deno.env.set('TRUST_PROXY', 'true');

function fakePostgres() {
  const counters = new Map<string, number>();
  const spent = new Set<string>();
  const client = {
    queryObject(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO fresh_rate_limits')) {
        // hit() upserts one row; record() upserts several in one statement.
        let n = 0;
        for (let i = 0; i < params.length; i += 2) {
          const key = `${params[i]}@${params[i + 1]}`;
          n = (counters.get(key) ?? 0) + 1;
          counters.set(key, n);
        }
        return Promise.resolve({ rows: [{ count: n }] });
      }
      if (sql.includes('SELECT count FROM fresh_rate_limits')) {
        const key = `${params[0]}@${params[1]}`;
        return Promise.resolve({ rows: counters.has(key) ? [{ count: counters.get(key)! }] : [] });
      }
      if (sql.includes('INSERT INTO fresh_captcha_spent')) {
        const nonce = String(params[0]);
        if (spent.has(nonce)) return Promise.resolve({ rows: [] });
        spent.add(nonce);
        return Promise.resolve({ rows: [{ nonce }] });
      }
      return Promise.resolve({ rows: [] }); // pruning DELETEs
    },
  };
  rateLimitDbForTesting.withConnection =
    (<T>(handler: (c: never) => Promise<T>) => handler(client as never)) as typeof rateLimitDbForTesting.withConnection;
  return { counters, spent };
}

function mxFor(domains: Record<string, 'mx' | 'none' | 'null'>) {
  clearMailDomainCache();
  mailDomainResolverForTesting.current = (domain: string) => {
    const kind = domains[domain] ?? 'none';
    if (kind === 'none') return Promise.reject(new Deno.errors.NotFound('no MX'));
    if (kind === 'null') return Promise.resolve([{ preference: 0, exchange: '.' }]);
    return Promise.resolve([{ preference: 10, exchange: `mx.${domain}.` }]);
  };
}

/** A challenge minted ten seconds ago, with its correct answer. */
async function solved(): Promise<{ token: string; answer: string }> {
  const { token } = await issueCaptcha(Math.floor(Date.now() / 1000) - 10);
  return { token, answer: await answerFor(token) };
}

let ipCounter = 0;
async function input(overrides: Partial<GuardInput> = {}): Promise<GuardInput> {
  const { token, answer } = await solved();
  return {
    req: new Request('http://localhost/api/gate-submit', {
      method: 'POST',
      headers: { 'x-forwarded-for': `198.51.100.${++ipCounter % 250}` },
    }),
    remoteHost: '127.0.0.1',
    email: 'person@mail.test',
    emailHash: `hash-${crypto.randomUUID()}`,
    captchaToken: token,
    captchaAnswer: answer,
    honeypot: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

Deno.test('captcha: the right answer passes; spacing is forgiven', async () => {
  const { token, answer } = await solved();
  assert((await verifyCaptcha(token, answer)).ok);
  assert((await verifyCaptcha(token, ` ${answer.slice(0, 3)} ${answer.slice(3)} `)).ok);
});

Deno.test('captcha: wrong, missing, forged and expired are all refused', async () => {
  const { token, answer } = await solved();
  const wrong = answer.replace(/./, (d) => (d === '2' ? '3' : '2'));
  assertEquals(await verifyCaptcha(token, wrong), { ok: false, reason: 'wrong' });
  assertEquals(await verifyCaptcha(token, ''), { ok: false, reason: 'wrong' });
  assertEquals(await verifyCaptcha(undefined, answer), { ok: false, reason: 'malformed' });
  assertEquals(await verifyCaptcha('not-a-token', answer), { ok: false, reason: 'malformed' });

  const now = Math.floor(Date.now() / 1000);
  const old = (await issueCaptcha(now - CAPTCHA_MAX_AGE_SECONDS - 1)).token;
  assertEquals(await verifyCaptcha(old, await answerFor(old), now), { ok: false, reason: 'expired' });
});

Deno.test('captcha: a challenge can be answered the moment it is issued (the retry page and /login do this)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const { token } = await issueCaptcha(now);
  assert((await verifyCaptcha(token, await answerFor(token), now)).ok);
});

Deno.test('captcha: an answer is bound to the key; another deployment cannot mint valid pairs', async () => {
  const { token, answer } = await solved();
  Deno.env.set('CAPTCHA_SECRET', 'some-other-key');
  try {
    assertEquals((await verifyCaptcha(token, answer)).ok, false);
  } finally {
    Deno.env.delete('CAPTCHA_SECRET');
  }
});

Deno.test('captcha: the image is a real PNG, embedded, carrying no digits as text', async () => {
  const c = await issueCaptcha();
  assert(c.image.startsWith('data:image/png;base64,'));
  const bytes = Uint8Array.from(atob(c.image.split(',')[1]), (ch) => ch.charCodeAt(0));
  assertEquals([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(!c.token.includes(await answerFor(c.token)), 'the answer must not be readable from the token');
});

// ---------------------------------------------------------------------------

Deno.test('guard: a solved challenge to a real mail domain is allowed', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  assertEquals(await guardMagicLinkRequest(await input()), { kind: 'allow' });
});

Deno.test('guard: no challenge, or a wrong one, is refused -- a script that cannot read the image sends nothing', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const decision = await guardMagicLinkRequest(await input({ captchaToken: undefined, captchaAnswer: undefined }));
  assertEquals(decision, { kind: 'refuse', code: 'captcha' });
  const wrong = await guardMagicLinkRequest(await input({ captchaAnswer: '000000' }));
  assertEquals(wrong, { kind: 'refuse', code: 'captcha' });
});

Deno.test('guard: a solved challenge cannot be replayed', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const first = await input();
  assertEquals((await guardMagicLinkRequest(first)).kind, 'allow');
  const replay = { ...(await input()), captchaToken: first.captchaToken, captchaAnswer: first.captchaAnswer };
  assertEquals(await guardMagicLinkRequest(replay), { kind: 'refuse', code: 'captcha' });
});

Deno.test('guard: a filled honeypot is silenced, before the challenge is even read', async () => {
  const db = fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  assertEquals(await guardMagicLinkRequest(await input({ honeypot: 'https://spam.example' })), { kind: 'silent' });
  assertEquals(db.spent.size, 0, 'the challenge was not spent');
});

Deno.test('guard: a domain with no MX, or a null MX, is refused as an address error', async () => {
  fakePostgres();
  mxFor({ 'gmial.com': 'none', 'example.com': 'null' });
  assertEquals(await guardMagicLinkRequest(await input({ email: 'a@gmial.com' })), { kind: 'refuse', code: 'email' });
  assertEquals(await guardMagicLinkRequest(await input({ email: 'a@example.com' })), {
    kind: 'refuse',
    code: 'email',
  });
});

Deno.test('guard: a DNS failure that is not NXDOMAIN does not turn a person away', async () => {
  fakePostgres();
  clearMailDomainCache();
  mailDomainResolverForTesting.current = () => Promise.reject(new Error('SERVFAIL'));
  assertEquals((await guardMagicLinkRequest(await input())).kind, 'allow');
});

/** Admit one request for `emailHash` and, if admitted, send it. */
async function sendTo(emailHash: string): Promise<string> {
  const decision = await guardMagicLinkRequest(await input({ emailHash }));
  if (decision.kind === 'allow') await recordSent(emailHash);
  return decision.kind;
}

Deno.test('guard: one address receives at most two links a day; the third is silenced', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const kinds = [];
  for (let i = 0; i < 3; i++) kinds.push(await sendTo('hash-of-one-victim'));
  assertEquals(kinds, ['allow', 'allow', 'silent']);
});

Deno.test('guard: the daily cap counts links sent -- admitted requests whose send failed do not count', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const emailHash = 'hash-whose-sends-failed';
  // Five admitted requests, none sent (recordSent never called).
  for (let i = 0; i < 5; i++) {
    assertEquals((await guardMagicLinkRequest(await input({ emailHash }))).kind, 'allow');
  }
  // Nothing was received, so the full allowance remains.
  const kinds = [];
  for (let i = 0; i < 3; i++) kinds.push(await sendTo(emailHash));
  assertEquals(kinds, ['allow', 'allow', 'silent']);
});

Deno.test('guard: silenced and busy requests leave the address count untouched', async () => {
  const db = fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const emailHash = 'hash-of-a-patient-person';
  Deno.env.set('GATE_GLOBAL_HOURLY_MAX', '1');
  try {
    assertEquals(await sendTo('someone-else'), 'allow'); // fills the hour
    for (let i = 0; i < 3; i++) assertEquals(await sendTo(emailHash), 'refuse');
  } finally {
    Deno.env.delete('GATE_GLOBAL_HOURLY_MAX');
  }
  assert(![...db.counters.keys()].some((k) => k.startsWith(`email:${emailHash}@`)), 'busy refusals charged nothing');
  // The hour has room again (default ceiling); the refusals did not cap them.
  assertEquals(await sendTo(emailHash), 'allow');
});

Deno.test('guard: the site-wide hourly ceiling refuses once reached', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  Deno.env.set('GATE_GLOBAL_HOURLY_MAX', '2');
  try {
    const kinds = [];
    for (let i = 0; i < 3; i++) kinds.push(await sendTo(`hash-${i}`));
    assertEquals(kinds, ['allow', 'allow', 'refuse']);
  } finally {
    Deno.env.delete('GATE_GLOBAL_HOURLY_MAX');
  }
});

Deno.test('guard: IPv6 clients are counted per /64, so rotating the interface id gains nothing', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const kinds = [];
  for (let i = 1; i <= 7; i++) {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'x-forwarded-for': `2001:db8:aa:bb::${i.toString(16)}` },
    });
    kinds.push((await guardMagicLinkRequest(await input({ req }))).kind);
  }
  assertEquals(kinds, ['allow', 'allow', 'allow', 'allow', 'allow', 'allow', 'refuse']);
});

Deno.test('clientKey: IPv4 unchanged, mapped IPv4 unwrapped, IPv6 reduced to its /64', () => {
  assertEquals(clientKey('203.0.113.9'), '203.0.113.9');
  assertEquals(clientKey('::ffff:198.51.100.7'), '198.51.100.7');
  assertEquals(clientKey('2a06:1700:2:20c::3804:466a'), '2a06:1700:0002:020c::/64');
  assertEquals(clientKey('2A06:1700:0002:020C:5e1f:1dea:0:1'), '2a06:1700:0002:020c::/64');
  assertEquals(clientKey('[2001:db8::1]'), '2001:0db8:0000:0000::/64');
  assertEquals(clientKey('fe80::1%eth0'), 'fe80:0000:0000:0000::/64');
});

Deno.test('guard: one client is refused after six attempts in an hour, whatever it submits', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const req = () => new Request('http://localhost/', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' } });
  const kinds = [];
  for (let i = 0; i < 7; i++) kinds.push((await guardMagicLinkRequest(await input({ req: req() }))).kind);
  assertEquals(kinds, ['allow', 'allow', 'allow', 'allow', 'allow', 'allow', 'refuse']);
});

Deno.test('guard: the counters never hold a client address', async () => {
  const db = fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const req = new Request('http://localhost/', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.77' } });
  await guardMagicLinkRequest(await input({ req }));
  for (const key of db.counters.keys()) assert(!key.includes('203.0.113.77'), `address leaked into ${key}`);
});

Deno.test('guard: onion traffic (loopback, no X-Forwarded-For) shares one larger bucket', async () => {
  const db = fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const req = new Request('http://localhost/', { method: 'POST' });
  assertEquals((await guardMagicLinkRequest(await input({ req, remoteHost: '127.0.0.1' }))).kind, 'allow');
  assert([...db.counters.keys()].some((k) => k.startsWith('ip:onion:h@')));
});

// ---------------------------------------------------------------------------
// The question in words (lib/text-challenge.ts)
// ---------------------------------------------------------------------------

Deno.test('question: every challenge carries one, and its answer passes instead of the digits', async () => {
  const { token } = await issueCaptcha(Math.floor(Date.now() / 1000) - 10);
  const q = await questionFor(token);
  assert(q.prompt.endsWith('?'));
  const verdict = await verifyCaptcha(token, { digits: '', text: q.answers[0] });
  assert(verdict.ok && verdict.via === 'question');
});

Deno.test('question: a wrong answer and an empty one are both refused', async () => {
  const { token } = await issueCaptcha(Math.floor(Date.now() / 1000) - 10);
  assertEquals(await verifyCaptcha(token, { text: 'definitely not it' }), { ok: false, reason: 'wrong' });
  assertEquals(await verifyCaptcha(token, { text: '   ' }), { ok: false, reason: 'wrong' });
});

Deno.test('question: capitals, accents, punctuation and a leading "the" are forgiven', () => {
  assertEquals(normaliseAnswer('  The Great-Bear! '), 'great bear');
  assertEquals(normaliseAnswer('Boötes'), 'bootes');
  const lion = textChallengeFor(new Uint8Array([0, 0])); // first in the bank
  assert(textAnswerMatches(lion, 'LEO'));
  assert(textAnswerMatches(lion, 'the leo'));
  assert(!textAnswerMatches(lion, 'lion'), 'the question names the lion; the answer is its constellation');
});

Deno.test('question: every question in the bank is reachable and has an answer', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 4096; i++) {
    const q = textChallengeFor(new Uint8Array([i >> 8, i & 0xff]));
    assert(q.answers.length > 0 && q.answers.every((a) => a !== ''), q.prompt);
    seen.add(q.prompt);
  }
  assertEquals(seen.size, TEXT_CHALLENGE_COUNT);
});

Deno.test('question: an element symbol is spelled out for screen readers', () => {
  const prompts = new Set<string>();
  for (let i = 0; i < 4096; i++) prompts.add(textChallengeFor(new Uint8Array([i >> 8, i & 0xff])).prompt);
  assert([...prompts].some((p) => p.includes('symbol Fe (capital F, lowercase e)')));
});

Deno.test('guard: the question answer alone gets through the guard', async () => {
  fakePostgres();
  mxFor({ 'mail.test': 'mx' });
  const { token } = await solved();
  const q = await questionFor(token);
  const decision = await guardMagicLinkRequest(
    await input({ captchaToken: token, captchaAnswer: '', questionAnswer: q.answers[0] }),
  );
  assertEquals(decision, { kind: 'allow' });
});

Deno.test('recordSent: counts the address and the site-wide ceiling in one statement', async () => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  rateLimitDbForTesting.withConnection = (<T>(handler: (c: never) => Promise<T>) =>
    handler({
      queryObject: (sql: string, params: unknown[]) => {
        statements.push({ sql, params });
        return Promise.resolve({ rows: [] });
      },
    } as never)) as typeof rateLimitDbForTesting.withConnection;
  await recordSent('hash-atomic');
  assertEquals(statements.length, 1, 'one statement, so both counts move together or not at all');
  assertEquals(statements[0].params.filter((_, i) => i % 2 === 0), ['email:hash-atomic', 'global:magiclink']);
});

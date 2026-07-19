# Throughput & encryption-audit tests

Two complementary suites that together answer: _does a user's run through the app
— prolegomenon to completed, encrypted submission — keep all plaintext encrypted
in transit and at rest?_

## 1. `encryption_audit_test.ts` — offline guardrails

Static assertions that encode the mandatory encryption invariants (see
`CLAUDE.md` and `docs/encryption-audit.md`). **No database, server, or gate
required.** Fast; safe to run in CI on every commit.

```bash
deno test --allow-read tests/throughput/encryption_audit_test.ts
```

It fails the build if a change:

- declares a plaintext PII column in a migration (beyond the known legacy set);
- makes the gate client stop failing closed, or gives it a DB write (plaintext
  fallback);
- lets `gate-submit` persist answer text instead of `NULL` + gate ciphertext;
- reintroduces a plaintext answer sink in `/api/responses` (regression guard for
  finding D-1);
- interpolates plaintext PII (`email`, `answer`, `token`, …) into a `console.*`
  call.

## 2. `journey_test.ts` — live end-to-end walk

Drives the real HTTP journey as wired, asserting that no response ever echoes the
plaintext email or answer sentinels, that the magic link carries no address, and
that session cookies are `HttpOnly; SameSite=Strict`.

**This mutates a live database and calls the Rust gate, so it is opt-in.** Without
`THROUGHPUT_LIVE=1` (or if the stack is unreachable) it skips, keeping CI green.

Prerequisites:

- Fresh app running: `deno task start` (listens on `PORT`, default `7268`)
- Rust gate reachable at `GATE_URL` (else `gate-submit` fails closed with 503)
- `DENO_ENV != production` (so `/api/auth/magic-link` returns the `_dev*` tokens
  the walk uses instead of a clicked email link)

```bash
THROUGHPUT_LIVE=1 BASE_URL=http://localhost:7268 \
  deno test --allow-net --allow-env tests/throughput/journey_test.ts
```

The walk uses a disposable `throughput+<uuid>@example.invalid` address and
sentinel answer strings; each run writes a magic-link row, a questionnaire
session, gate ciphertext, and a profile row for that throwaway identity.

## Steps the walk exercises

1. `GET /` — prolegomenon renders the gate form (`action="/api/gate-submit"`)
2. `POST /api/gate-submit` — answers age-encrypted via the gate (or 503 fail-closed)
3. `POST /api/auth/magic-link` — issues verification tokens; link has no email
4. `GET /auth/verify` — sets `jwt` + `resume_token` cookies (302 → `/questionnaire`)
5. `GET`/`POST /questionnaire` — loop to `/completion`
6. `GET /completion`
7. `GET /profile-choice`, `GET /profile-create`, `POST /api/profile`

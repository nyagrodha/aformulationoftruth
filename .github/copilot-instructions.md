# AI Agent Instructions for aformulationoftruth

## Project Overview

A web application for administering the Proust Questionnaire with a focus on
self-inquiry and contemplative practice. It is a **Deno + Fresh** application
(Preact for islands, PostgreSQL via `deno-postgres`, `zod` for request
validation). There is no Express, no React, no Drizzle and no Jest; any
instruction or file that says otherwise is stale.

## Core Architecture

### Project Structure

```
/
├── main.ts / dev.ts       # Fresh entry points (start, signal handling)
├── fresh.gen.ts           # Generated route manifest -- regenerate, never hand-edit
├── routes/                # Fresh routes; a file is a page or, under api/, a JSON handler
│   ├── _middleware.ts     # Request-path middleware (audience counting, client IP)
│   ├── api/               # POST handlers: gate-submit, auth/, questions/, responses/
│   └── *_test.ts(x)       # Route tests live beside the route they test
├── islands/               # Preact islands (client-side interactivity)
├── components/            # Server-rendered Preact components
├── lib/                   # Everything that is not a route: sessions, crypto,
│                          #   email, audience, gate provisioning, romania client
├── db/migrations/         # Numbered SQL migrations, applied by migrate.ts
├── tests/                 # Cross-cutting and database-backed tests
├── romania/               # The key box / render service (separate Deno process)
├── rust-server/           # The gate: age-encrypts answers before they are stored
├── public/                # Static assets, including no-JS-fallback pages
├── scripts/               # Pre-commit checks (zero-logging, secrets)
└── monitoring/            # Operational Python scripts
```

### Key Components

1. **Authentication** — magic links (`routes/api/auth/magic-link.ts`,
   `routes/api/gate-submit.ts`, `routes/auth/verify.tsx`). The link carries a
   JWT plus an opaque resume token whose HMAC is the session id
   (`lib/questionnaire-session.ts`, `lib/jwt.ts`). Email goes out through
   `lib/email.ts`, which spawns `lib/send_mail.py`.
2. **Questionnaire flow** — sessions with a per-respondent shuffled order,
   progress carried across a second magic link (`planSupersede`), and answers
   sealed to a per-submission keypair by the Rust gate (`lib/gate_encrypt.ts`,
   `lib/gate-provision.ts`).
3. **Delivery** — `routes/api/responses/deliver.ts` builds a bundle that the
   key box (`romania/`) opens with `keyId` (the gate token) and reports against
   `sessionId`. Those are different strings; never substitute one for the other.
4. **Audience counting** — `lib/audience.ts`: how many, never who. Integers
   only reach the database.

## Development

```bash
deno task dev          # local server (see .env; DATABASE_URL is deliberately unset)
deno task test         # everything, including ~46 pre-existing failures (see below)
deno task hooks        # point git at hooks/pre-commit (zero-logging + secrets checks)
deno fmt && deno lint  # singleQuote, 2 spaces, 120 cols (deno.json)
```

`deno task test` runs every test file, and some of them have carried type errors
and failures for a long time (`tests/newsletter_test.ts`, `tests/contact_test.ts`,
`tests/questionnaire_e2e_test.ts`, which needs a running server). A green run is
not the bar; "no new failures against a baseline run" is. CI does not run the
whole tree: `.github/workflows/ci.yml` names its test files explicitly so the
clean ones get the type check. Run a single file with
`deno test --allow-env --allow-read --allow-net path/to/x_test.ts`.

Database-backed tests gate on `DATABASE_URL` and skip silently without it. CI
provides a Postgres service and mints the test secrets per run; do not commit
literals that look like credentials.

### Environment

Read `.env.example` and `.github/workflows/ci.yml` for the current variable
set. Notable: `JWT_SECRET`, `RESUME_TOKEN_SECRET`, `DATABASE_URL`, `BASE_URL`,
`DENO_ENV`, `EMAIL_TRANSPORT` (`stub` under test), `SMTP_*`,
`KEYBOX_RENDER_URL` / `KEYBOX_RENDER_TOKEN`, `BREAKGLASS_AGE_RECIPIENT`.

### Database

Schema lives in `db/migrations/*.sql`, applied in order by `migrate.ts`.
Questionnaire tables store hashes and ciphertext; the audience table stores
aggregate integer counts. There is no plaintext email, address or answer
anywhere in Postgres.

### Testing Strategy

- `Deno.test` with `$std/assert`, in `tests/` and beside routes/libs as
  `*_test.ts(x)`. Run with `deno task test`. There is no Jest.
- Route handlers are tested by calling `handler.POST(request, {} as never)`
  directly; see `routes/api/gate-submit_test.ts` for the stub-fetch pattern.
- Pure logic goes in `lib/` and gets unit tests; endpoints get one
  database-backed walk that crosses the stage boundary.

## Important Code Patterns

### Zero logging of personal data

`scripts/check-zero-logging.sh` runs on every commit. Log a **category**, never
the error object, whenever the error could carry an address, a token, or an
answer:

```typescript
} catch {
  console.error('[gate-submit] Email delivery failed'); // status only
  increment('errors.email');
  return fail(500, 'Failed to send magic link email. Please try again.', 'send');
}
```

### Fail closed

If the gate did not take the plaintext, the endpoint must not pretend it did:
return 503 and store nothing. Never fall back to storing anything in the clear.

### Request validation

`zod` schemas are declared next to the handler that uses them, sized to the
database column (`VARCHAR(64)` means `.max(64)`).

### Test seams

Prefer a small exported seam (`magicLinkForTesting`, `_resetForTest`) over
reaching into module state, and gate any seam that would retain a secret on
`DENO_ENV === 'test'`.

## Key Files to Review

- `routes/api/gate-submit.ts` — the one place gate answers enter the system
- `lib/questionnaire-session.ts` — session lifecycle and `planSupersede`
- `routes/api/responses/deliver.ts` and `romania/render-service.ts` — delivery
- `lib/audience.ts` — the privacy argument for the visitor count, in full
- `.github/workflows/ci.yml` — which tests CI actually runs (an explicit list)

## Pitfalls to Avoid

1. Do not add a test file and assume CI runs it: `ci.yml` names test files
   explicitly. Add yours to the list.
2. `fresh.gen.ts` is generated. Regenerate it; do not edit it.
3. `deno-postgres` returns `BIGINT` as `bigint`. Cast in SQL (`::int`) or
   normalise before serialising.
4. Modules are cached for the life of a test process: read environment
   variables when you use them, not at import, if a test may set them later.
5. Never point database-backed tests at a production `DATABASE_URL`.

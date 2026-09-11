# Multi-tenant questionnaires — architecture design

Date: 2026-08-31
Status: draft, awaiting review
Scope: all five sub-projects in one document, at the author's request

## Problem

`aformulationoftruth.com` serves one questionnaire, hardcoded in
`lib/questions_dakshinaparvanuvadam.ts`. The goal is to let invited authors
publish their own questionnaires and have respondents' answers protected at
least as well as they are today — with the decrypting private key held off the
web tier, and an optional PDF of the responses.

## Decisions taken

| Decision | Choice |
|---|---|
| Custody | **Both** models; the author picks per questionnaire |
| Readership | **Respondent only**, with an option to send a copy to the author |
| Share timing | Depends on mode (see [Sharing](#sharing)) |
| Authorship | **Invite/allowlist**, unlisted URLs, no public directory |
| Question model | **Free text** plus per-question settings |
| Architecture | **Two pipelines** — real end-to-end for browser mode |

The two-pipeline choice was made knowingly against the alternative of a single
policy-driven pipeline. It buys a guarantee that no single machine ever sees
plaintext for `e2e` questionnaires; it costs a second storage path and excludes
no-JS respondents from those questionnaires.

## Goals

- An invited author can publish a questionnaire at an unlisted URL.
- A respondent's answers are readable only by the respondent, unless the
  respondent affirmatively sends a copy to the author.
- `keybox` questionnaires keep today's guarantees exactly, including PDF
  delivery and no-JS support.
- `e2e` questionnaires guarantee that no server ever holds plaintext.
- The existing Proust questionnaire becomes tenant #1 with no behaviour change.

## Non-goals

- Public discovery, directories, or search.
- Question types beyond free text.
- Key rotation of any kind (see [Risks](#risks)).
- Cross-respondent aggregation or analytics.
- Editing a questionnaire's custody mode after creation.

---

## Data model

### New

**`questionnaires`**

    id                 UUID PRIMARY KEY
    author_email_hash  VARCHAR(64) NOT NULL      -- FK fresh_profiles
    unlisted_token     TEXT NOT NULL UNIQUE      -- the URL; unguessable, not an id
    title              TEXT NOT NULL
    intro              TEXT
    custody_mode       TEXT NOT NULL CHECK (custody_mode IN ('keybox','e2e'))
    share_policy       TEXT NOT NULL CHECK (share_policy IN ('never','respondent_choice'))
    status             TEXT NOT NULL CHECK (status IN ('draft','published','closed'))
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()

`custody_mode` is **immutable after creation**. There is deliberately no
`UPDATE` path and no `rotated_at`, for the same reason `014_profile_messaging`
refuses key rotation: switching modes cannot migrate existing responses without
decrypting them, and a schema that permits the write invites the one that
strands an archive.

**`questionnaire_questions`**

    questionnaire_id   UUID NOT NULL
    question_index     INT  NOT NULL
    prompt             TEXT NOT NULL
    max_length         INT  NOT NULL DEFAULT 20000
    skippable          BOOLEAN NOT NULL DEFAULT TRUE
    is_gate            BOOLEAN NOT NULL DEFAULT FALSE
    UNIQUE (questionnaire_id, question_index)

`is_gate` generalises the current constant "questions 0 and 1 are the gate".

**`questionnaire_authors`** — the invite allowlist.

    CREATE TABLE IF NOT EXISTS questionnaire_authors (
        email_hash  VARCHAR(64) PRIMARY KEY,   -- the anchor, never an email
        granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        granted_by  VARCHAR(64),               -- email_hash of the granter; NULL for the first
        note        TEXT,                      -- why, for future reference
        revoked_at  TIMESTAMPTZ                -- soft revoke; never DELETE
    );

    CREATE INDEX IF NOT EXISTS idx_questionnaire_authors_live
        ON questionnaire_authors (email_hash)
        WHERE revoked_at IS NULL;

A table rather than a `can_author` flag on `fresh_profiles`, for four reasons.
`006` states that only content a visitor *deliberately publishes* lives in that
table, and an authorization fact granted by someone else is not that. A boolean
cannot record when a grant was made, by whom, or that it was withdrawn. Profile
rows are optional, so a flag makes "false" and "no row" two states meaning the
same thing, where a grants table makes the row's existence the grant. And it
would couple authoring to publishing a public profile, which works against the
unlisted-URL decision.

Revocation is a soft `UPDATE`, never a `DELETE` — deleting the row reimplements
the boolean with extra steps. The partial index mirrors `pdf_resend_tokens`'
`WHERE used_at IS NULL`, so the live-capability query reads the same across
both tables. Membership is granted out of band; there is no self-service path.

**`e2e_answers`**

    questionnaire_id  UUID NOT NULL
    session_id        TEXT NOT NULL
    question_index    INT  NOT NULL
    ciphertext        TEXT NOT NULL      -- base64, sealed in the browser
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    UNIQUE (session_id, question_index)

Deliberately **not** the same table as `gate_encrypted_answers`. The two hold
ciphertext produced by different stacks under different threat models, and a
shared table with a discriminator column would let one query treat them as
interchangeable. The separation is the safeguard.

**`questionnaire_author_keys`** — the `e2e` author keypair, following
`messenger_identities` exactly: `public_key`, `wrapped_private`, `wrap_iv`,
`kdf_salt`, `kdf_iterations` with the same `BETWEEN 100000 AND 1000000` CHECK.
INSERT-only, no rotation.

### Changed

`gate_encrypted_answers` and `fresh_gate_responses` each gain
`questionnaire_id`. The migration inserts Proust as questionnaire #1 and
backfills every existing row to it, so current data becomes tenant one rather
than a special case.

---

## Pipeline K — key box

Today's path, generalised. Unchanged in substance:

1. Session keypair minted per response session (`generateSessionKeypair`)
2. Identity pushed to the key box, namespaced by questionnaire
3. Answers to the Rust gate, stored as armored age ciphertext
4. Render and delivery via `romania/`, unchanged

`recipientsForSession(sessionPubkey, breakglass)` becomes
`resolveRecipients(questionnaire, session)`. Works without JavaScript.

## Pipeline E — end-to-end

1. The browser fetches the author's `public_key`
2. Each answer is sealed client-side using the existing
   `public/js/messenger-crypto.js` and `seal-guards.js`
3. The browser POSTs ciphertext; the server validates **shape only** —
   base64, length bound, index in range for this questionnaire — and stores
4. The author unwraps their private key in their own browser with their
   passphrase and decrypts

No gate, no session identity, no key box, no server-side render. The server
cannot read what it stores, and never held the plaintext.

**No-JS handling.** An `e2e` questionnaire served without JavaScript renders a
`<noscript>` block explaining that it encrypts in the browser and cannot accept
answers without it. It must never present a form that silently fails. This is a
deliberate, visible exclusion — the site's no-JS guarantee holds for `keybox`
questionnaires and is explicitly suspended for `e2e` ones.

**Crypto stacks.** This introduces a second stack (WebCrypto P-256 / AES-GCM)
alongside age/X25519. That cost is already paid: the messenger feature ships,
reviews and tests it. Introducing a third would be worse than reusing this one.

---

## Sharing

Sharing is always the respondent's affirmative act, and is **irrevocable** —
both age and the messenger seal fix readership at encryption time. Consent copy
must say "permanently", never "you can change this later".

| | Pipeline K | Pipeline E |
|---|---|---|
| Respondent PDF | server-rendered, as today | client-side export only |
| Share to author | after completion; the render service decrypts with the session identity and re-encrypts/mails to the author | at completion, in the browser, sealed to the author's public key while plaintext is still in hand |
| Break-glass | yes | **none** |
| Works without JS | yes | no |

Pipeline K's share path adds a second purpose for which the key box briefly
holds plaintext. That is a real widening of the existing window and should be
bounded by the same deadline discipline as the render path.

---

## Sub-projects and sequencing

| | Sub-project | Depends on | New crypto |
|---|---|---|---|
| P1 | Questions as data; Proust becomes row #1 | — | none |
| P2 | Authoring: allowlist, editor, publish, unlisted URL | P1 | none |
| P3 | Multi-tenant Pipeline K | P1 | extends existing |
| P4 | Pipeline E: author keys, client seal, no-JS refusal | P1, P2 | yes |
| P5 | Sharing, one path per pipeline | P3, P4 | yes |

P1 is the only piece buildable and fully testable while the key box is down,
and its success criterion is exact: **the Proust questionnaire behaves
identically.** It should land first and alone.

### P1's landmines

Each is an assumption a second questionnaire breaks:

- `CANONICAL_COUNT` is load-bearing in `buildBundle`'s range and duplicate checks
- the Rust gate validates `question_index` against a hardcoded `0..64`
- `lib/questionnaire.ts` hardcodes that the gate questions are indexes 0 and 1
- `GATE_QUESTIONS` is imported directly by `gate-submit.ts`

---

## Security properties

**Preserved for `keybox`:** everything in `docs/chain-of-custody.md`. The web
tier encrypts but cannot decrypt; identities live only on the key box;
per-session keys bound the blast radius; every failure fails closed.

**Added for `e2e`:** no server, including the key box, ever holds plaintext or
a usable private key. This closes the loopback plaintext window that is the
softest point of the current design.

**Not provided by either:** protection against a compromised *browser*.
Pipeline E moves trust from the server to the client; it does not remove it.

---

## Risks

1. **Passphrase loss is total loss.** An `e2e` author who forgets their
   passphrase destroys every response ever submitted to that questionnaire,
   with no error at the moment of loss because the ciphertext stays
   well-formed. There is no break-glass by construction. The UI must state
   this before an author selects `e2e`, not after.
2. **Two pipelines, two share paths, two crypto stacks.** The surface area
   roughly doubles. Mitigated by the separate tables and by `custody_mode`
   being immutable, so no response can ever be ambiguous about its regime.
3. **No-JS exclusion** from `e2e` questionnaires, accepted deliberately.
4. **Author-side plaintext.** Once an author decrypts responses in their
   browser, the guarantee ends at their machine. Nothing in this design
   constrains what they do next.
5. **The key box remains a single point of failure for Pipeline K** across all
   tenants, as it is today — now with more tenants depending on it.

## Open questions

- Where does the author's delivery address live for Pipeline K sharing? The
  render service needs it, and it should not be stored in plaintext.
- Should `e2e` questionnaires be able to offer *any* PDF, via client-side
  generation, or is export out of scope?

## Testing

- **P1:** golden test that the Proust questionnaire's served order, gate
  selection, and bundle shape are byte-identical before and after.
- **Pipeline E:** the server must be shown to reject any payload it could read
  — a test that posts plaintext and expects refusal.
- **Both:** a test that a questionnaire's `custody_mode` cannot be updated.
- **Sharing:** a test that an unshared response is not readable with the
  author's key.

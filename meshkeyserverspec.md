# Mesh Keyserver + Key Registration — Schema & Endpoint Sketch

**Status:** draft for reconciliation against the real schema.
**Scope:** additive only. Magic-link auth flow is untouched; existing
`responses` / `profile` tables gain columns but no existing column changes
meaning. Everything here is designed so a mesh submission is
indistinguishable from a web submission downstream.

---

## Design invariants (carry these into every decision)

1. **Keyserver is decoupled from PII.** The keyserver stores public keys
   against fingerprints and *nothing that identifies a person*. There is no
   `user_id` foreign key on the key table. The association "this fingerprint
   is me" lives only inside the user's own age-encrypted profile blob, which
   the server operator cannot read.
2. **No per-key lookups.** Nodes never fetch `GET /keys/{fingerprint}`. They
   pull the **entire keyset as one signed, versioned bundle** so an observer
   can't infer which key a node cares about (query-pattern leakage).
3. **Registration proves possession.** You can only register a key you hold
   the private half of (a signature over a server nonce). This blocks
   registering someone else's or a garbage pubkey.
4. **Visibility is the user's switch.** The existing `profileVisibility`
   (`private` | `anonymous` | `public`) decides whether and how a key enters
   the published bundle.

---

## 1. Schema changes

DB-agnostic; expressed as SQL. `BLOB` = raw bytes, `TEXT` = utf8.

### 1a. `identity_keys` — the keyserver table (no PII)

```sql
CREATE TABLE identity_keys (
  fingerprint     TEXT PRIMARY KEY,      -- BLAKE2b-256(enc_pubkey || sig_pubkey), base32
  enc_pubkey      BLOB NOT NULL,         -- x25519 recipient (age)
  sig_pubkey      BLOB NOT NULL,         -- ed25519 verify key (response signatures)
  key_algo        TEXT NOT NULL DEFAULT 'x25519+ed25519',
  key_version     INTEGER NOT NULL DEFAULT 1,
  visibility      TEXT NOT NULL,         -- 'private' | 'anonymous' | 'public'
  handle          TEXT,                  -- only meaningful when visibility='public', else NULL
  created_at      INTEGER NOT NULL,      -- unix seconds
  revoked_at      INTEGER,               -- NULL = active
  supersedes      TEXT REFERENCES identity_keys(fingerprint)  -- key rotation chain
);

-- The bundle is generated from this predicate:
CREATE INDEX idx_identity_keys_published
  ON identity_keys (visibility, revoked_at);
```

Notes:
- **No `user_id`.** Deliberate. Registration is authorized by a magic-link
  session, but the inserted row carries no back-reference to the account.
- `private` keys are registered but **excluded** from the published bundle —
  usable for the owner's own P2P among peers they hand the key to directly,
  never broadcast.
- `anonymous` → bundle carries `fingerprint + pubkeys` only.
- `public` → bundle additionally carries `handle`.
- Rotation is a new row with `supersedes` pointing at the old fingerprint;
  the old row gets `revoked_at` set. Bundle consumers follow the chain.

### 1b. `profile` — one encrypted self-reference column

```sql
ALTER TABLE profile ADD COLUMN identity_fpr_enc BLOB;  -- age-encrypted fingerprint
```

The user's own fingerprint is stored **age-encrypted to the user's own
recipient**, so the fpr↔account link exists only for the user, never for the
operator. (If profiles are already a single encrypted blob, fold the
fingerprint into that blob instead and skip this column.)

### 1c. `responses` — mesh bundle export artifacts

The mesh bundle is a *view* of completed responses, CBOR-serialized and
signed. Cache it rather than regenerate per request:

```sql
ALTER TABLE responses ADD COLUMN mesh_bundle_cbor BLOB;   -- CBOR(payload)
ALTER TABLE responses ADD COLUMN mesh_bundle_sig  BLOB;   -- ed25519 over the CBOR
ALTER TABLE responses ADD COLUMN author_fpr       TEXT;   -- references a fingerprint, not a user
```

`mesh_bundle_cbor` payload shape (CBOR map):
```
{
  "v": 1,
  "fpr": "<author fingerprint>",
  "q":   "<question id>",
  "ct":  <bytes: age ciphertext of the answer>,   // encrypted to recipient(s)
  "ts":  <unix seconds>
}
```
Signed with the author's `sig` key so any peer verifies authorship offline
with no central authority. `ct` is age ciphertext, so relays never see
plaintext — same guarantee as the web path.

---

## 2. Key registration endpoint

Called once at profile creation (and again on rotation).

```
POST /keys/register
Auth: existing magic-link session cookie/token
Content-Type: application/cbor  (or JSON if you prefer)
```

**Two-step, to prove possession without leaking identity:**

### Step 1 — obtain a challenge
```
GET /keys/challenge   ->   { "nonce": <32 random bytes>, "exp": <unix+120s> }
```
Server stores `nonce -> exp` in a short-TTL cache (not tied to the user).

### Step 2 — submit registration
Request body:
```
{
  "enc_pubkey":  <bytes>,          // x25519 age recipient
  "sig_pubkey":  <bytes>,          // ed25519 verify key
  "nonce":       <bytes>,          // echoed from step 1
  "pop":         <bytes>,          // ed25519 sign(nonce) with sig private key
  "visibility":  "anonymous",      // 'private' | 'anonymous' | 'public'
  "handle":      null              // required iff visibility == 'public'
}
```

Handler logic:
```
1.  require_valid_session()                    // magic-link; authorizes the ACTION only
2.  assert nonce is live & unconsumed; consume it
3.  verify ed25519_verify(sig_pubkey, nonce, pop)      // proof of possession
4.  fpr = base32(blake2b_256(enc_pubkey || sig_pubkey))
5.  reject if fpr already exists and not revoked
6.  validate visibility enum; require handle iff 'public'; sanitize handle
7.  INSERT INTO identity_keys (... no user_id ...)
8.  RETURN { "fingerprint": fpr }
```

Client then writes `fpr` into its own encrypted profile
(`identity_fpr_enc`) — the server never records the mapping.

**Anti-abuse without identity:** rate-limit registrations per session
(e.g. ≤3 active keys) so the missing `user_id` can't be farmed. The counter
lives in session/rate-limit state, not on the key row.

### Rotation / revocation
```
POST /keys/revoke
{ "fingerprint": <old>, "sig": ed25519 sign("revoke:"+old+":"+nonce) }
```
Signed by the key being revoked (or its successor). Sets `revoked_at`.

---

## 3. Serving the keyset bundle (paired with registration)

```
GET /keyset.cbor
   ETag: "<keyset_version>"
   -> 304 if node already has this version
   -> 200 signed CBOR bundle otherwise
```

Bundle:
```
{
  "v": 1,
  "gen_at": <unix>,
  "keys": [ { "fpr", "enc_pubkey", "sig_pubkey", "handle?" }, ... ],  // published rows only
  "site_sig": <ed25519 over the above, with the SITE key>
}
```
- Built from `visibility IN ('anonymous','public') AND revoked_at IS NULL`.
- **Whole set, versioned, cacheable.** No per-fingerprint route exists.
- Signed by a **site key** so nodes trust the bundle's authenticity while it
  syncs over gossip; also serve it via the existing onion service so pulling
  it leaks no network metadata.
- Nodes carry the bundle in flash and gossip version numbers; a node behind
  version N pulls a fresh bundle from any gateway that has N+1.

---

## 4. Forward compatibility (don't build now, don't block later)

- The `identity_keys` table *is* the seed of an OAuth-style identity
  provider: fingerprint = subject, `sig_pubkey` = the verifier. An IdP later
  issues assertions over these without adding PII.
- Semaphore-style ZK: add a `commitment` column (Merkle-tree leaf) later so a
  user can prove "I'm a registered identity" without revealing *which*
  fingerprint. The no-PII, fingerprint-keyed design above is already the
  right shape for that upgrade.

---

## Open questions to lock the spec to reality

1. DB engine + is `profile` a set of columns or one encrypted blob?
2. Exact current **response submission** request (endpoint, method, body) so
   the mesh POST mirrors it byte-for-byte.
3. Is age encryption **client-side** (browser WASM) or **server-side**? Sets
   whether the node/visitor device or the gateway holds the recipient key.
4. Server stack/framework for the two new routes.

-- 014_profile_messaging.sql
--
-- Profile-to-profile messaging. The server stores ciphertext it cannot open.
--
-- Sealing is ECDH P-256 performed in the browser: each profile holds a keypair,
-- a message is encrypted under a key derived from the sender's private half and
-- the recipient's public half, and the same key falls out of the reverse pair on
-- the other side. Exactly two people can read any message, and the sender is one
-- of them -- which is what lets someone read their own sent mail without the
-- server keeping a second plaintext copy.
--
-- P-256 rather than the age x25519 used elsewhere in this schema, because this
-- key is derived and used INSIDE THE BROWSER. WebCrypto implements ECDH natively
-- and implements no x25519 KEM, so age would mean shipping a bundled
-- implementation -- and routes/index.tsx commits the site to "no third-party
-- requests of any kind". age remains correct for the server-side paths
-- (gate answers, contact) where lib/age-encrypt.ts already runs it.
--
-- What the server can see: who talked to whom, when, and how many bytes.
-- What it cannot see: any message body, and any private key.
--
-- Privacy invariants (see /var/www/CLAUDE.md):
--   * no column named `email` -- addresses appear only as email_hash
--   * no column holds an address or anything one is recoverable from
--
-- DDL NOTE: the application role (a4m_app) is deliberately DML-only and cannot
-- run this file -- `has_schema_privilege('a4m_app','public','CREATE')` is false.
-- Apply as the schema owner, then grant, exactly as 007 did.

BEGIN;

-- ---------------------------------------------------------------------------
-- Keystore.
--
-- public_key is public by construction and safe to serve to anyone.
-- wrapped_private is AES-GCM ciphertext under a key the server never sees:
-- PBKDF2-SHA256 over a passphrase that is never transmitted. The row is
-- therefore useless to whoever reads this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messenger_identities (
    email_hash      VARCHAR(64) PRIMARY KEY,
    public_key      TEXT        NOT NULL,          -- base64, raw P-256 point
    wrapped_private TEXT        NOT NULL,          -- base64, AES-GCM(pkcs8)
    wrap_iv         TEXT        NOT NULL,          -- base64, 12 bytes
    kdf_salt        TEXT        NOT NULL,          -- base64, 16 bytes
    kdf_iterations  INTEGER     NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ,
    CONSTRAINT messenger_identities_iterations_sane
        CHECK (kdf_iterations BETWEEN 1 AND 1000000)
);

-- ---------------------------------------------------------------------------
-- Threads. One per pair, forever.
--
-- The pair is stored in a canonical order -- lower hash in a_email_hash -- so
-- that the UNIQUE constraint actually enforces "one thread per pair". Without
-- the ordering, (alice, bob) and (bob, alice) are two different rows and two
-- people end up in separate halves of the same conversation, each seeing only
-- what they sent. Callers must not build these tuples by hand; lib/messenger.ts
-- orders them in one place.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messenger_threads (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    a_email_hash    VARCHAR(64) NOT NULL,
    b_email_hash    VARCHAR(64) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messenger_threads_pair_ordered CHECK (a_email_hash < b_email_hash),
    CONSTRAINT messenger_threads_pair_unique   UNIQUE (a_email_hash, b_email_hash)
);

CREATE INDEX IF NOT EXISTS idx_messenger_threads_a
    ON messenger_threads (a_email_hash, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_threads_b
    ON messenger_threads (b_email_hash, last_message_at DESC);

-- ---------------------------------------------------------------------------
-- Messages. Ciphertext and nothing else.
--
-- byte_len is stored so that quotas, rate limits and any future dashboard can
-- do their work without a single query needing to touch a body.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messenger_messages (
    id                BIGSERIAL   PRIMARY KEY,
    thread_id         UUID        NOT NULL
                        REFERENCES messenger_threads(id) ON DELETE CASCADE,
    sender_email_hash VARCHAR(64) NOT NULL,
    ciphertext        TEXT        NOT NULL,        -- base64, AES-GCM
    iv                TEXT        NOT NULL,        -- base64, 12 bytes
    byte_len          INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messenger_messages_thread
    ON messenger_messages (thread_id, id);

-- ---------------------------------------------------------------------------
-- Blocks. Directional: blocking someone does not block you to them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messenger_blocks (
    email_hash         VARCHAR(64) NOT NULL,       -- who is blocking
    blocked_email_hash VARCHAR(64) NOT NULL,       -- who is blocked
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (email_hash, blocked_email_hash),
    CONSTRAINT messenger_blocks_not_self CHECK (email_hash <> blocked_email_hash)
);

-- ---------------------------------------------------------------------------
-- fresh_profiles.accepts_anonymous_mail has existed since 006 and is read by
-- nothing. It becomes the messaging opt-in: no profile receives mail it did not
-- ask for. Nothing to alter -- recorded here so the coupling is discoverable
-- from the migration that relies on it.
-- ---------------------------------------------------------------------------

COMMIT;

-- Grants, mirroring 007: the app role gets DML and sequence access, never DDL.
--   GRANT SELECT, INSERT, UPDATE, DELETE ON messenger_identities,
--     messenger_threads, messenger_messages, messenger_blocks TO a4m_app;
--   GRANT USAGE, SELECT ON SEQUENCE messenger_messages_id_seq TO a4m_app;

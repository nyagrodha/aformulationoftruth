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
    -- The floor is 100000, not 1, and it is the same number
    -- routes/api/messenger/identity.ts enforces on the way in. A wrapped
    -- private key at one iteration is a wrapped private key in name only, and
    -- the two checks disagreeing meant the API's floor was the only one --
    -- worth nothing against a client that is not ours, which is the only case
    -- either check exists for. The ceiling matches seal-guards MAX_ITERATIONS.
    CONSTRAINT messenger_identities_iterations_sane
        CHECK (kdf_iterations BETWEEN 100000 AND 1000000)
);

-- There is deliberately no rotated_at, and no rotation.
--
-- Each row is the ONE keypair for an address, and every message ever sealed to
-- that public half is unreadable the moment it is replaced -- with no error at
-- the moment of loss, because the ciphertext is still perfectly well-formed.
-- A schema that carries a rotation timestamp invites the write that destroys
-- the archive. routes/api/messenger/identity.ts refuses to replace for the
-- same reason; createIdentity is INSERT-only. Offering rotation means
-- versioning keys and stamping every message with the version it was sealed
-- under, which is a different schema than this one -- not a column.

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

-- Supports the per-sender rolling window in sendMessage(). Without it the
-- count falls back to the index above and reads the whole thread -- which is
-- longest in exactly the case the limit exists to stop.
CREATE INDEX IF NOT EXISTS idx_messenger_messages_sender_window
    ON messenger_messages (thread_id, sender_email_hash, created_at DESC);

-- ---------------------------------------------------------------------------
-- The sender of a message must be one of the two people in its thread.
--
-- sendMessage() gets this right by construction: it resolves the thread from
-- the sender and the recipient, so the sender is a participant or the thread
-- does not exist. That is an argument about one function, and the constraint
-- it rests on is not written down anywhere the database can see -- any later
-- INSERT that takes thread_id from a request rather than deriving it would put
-- a stranger's hash in someone else's conversation, and every read path here
-- trusts sender_email_hash to decide whose message it is.
--
-- A foreign key cannot say this: the sender must match a_email_hash OR
-- b_email_hash, and an FK names one column set. Hence a trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION messenger_messages_sender_in_thread()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM messenger_threads t
         WHERE t.id = NEW.thread_id
           AND NEW.sender_email_hash IN (t.a_email_hash, t.b_email_hash)
    ) THEN
        RAISE EXCEPTION
            'sender % is not a participant in thread %',
            NEW.sender_email_hash, NEW.thread_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messenger_messages_sender_in_thread ON messenger_messages;
CREATE TRIGGER trg_messenger_messages_sender_in_thread
    BEFORE INSERT OR UPDATE OF thread_id, sender_email_hash ON messenger_messages
    FOR EACH ROW EXECUTE FUNCTION messenger_messages_sender_in_thread();

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

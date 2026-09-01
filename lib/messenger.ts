/**
 * Profile-to-profile messaging: threads, messages, keystore, blocks.
 *
 * Nothing in this module can read a message. It moves opaque base64 in and out
 * of Postgres and enforces who may do that. Sealing and opening happen in the
 * browser (public/js/messenger-crypto.js) under an ECDH P-256 key the server
 * never possesses -- see 014_profile_messaging.sql for why P-256 and not the
 * age x25519 used on the server-side paths.
 *
 * Two rules carried over from lib/answers.ts, whose header records what
 * ignoring them already cost:
 *
 *   1. Callers are server handlers and must call these functions directly.
 *      Do not re-enter the app's own HTTP API. Questionnaire answers were
 *      silently discarded for the entire life of that feature because a route
 *      called its own endpoint, got 401 on every request, and advanced anyway.
 *
 *   2. Storing either succeeds or throws. Nothing here returns a status a
 *      caller can forget to check.
 *
 * Zero-logging: no function here logs a hash, a body, a ciphertext or an id.
 * Failures are counted by category.
 */

import { withConnection, withTransaction } from './db.ts';
import { increment } from './metrics.ts';

/** Refused because the recipient never opened their door. Not a server fault. */
export class NotAcceptingMail extends Error {
  constructor() {
    super('That profile is not accepting messages.');
    this.name = 'NotAcceptingMail';
  }
}

/** Refused because one party blocked the other. */
export class Blocked extends Error {
  constructor() {
    super('That message cannot be delivered.');
    this.name = 'Blocked';
  }
}

/** The sender has no keypair yet, so nothing could have been sealed to them. */
export class NoIdentity extends Error {
  constructor() {
    super('No messaging identity has been set up.');
    this.name = 'NoIdentity';
  }
}

/**
 * A body larger than this is refused before it reaches the database.
 *
 * 64 KiB of base64 is roughly 48 KiB of plaintext -- far more than anyone types
 * and far less than enough to use the table as free storage. The bound exists
 * because the value arrives from a browser that may not be ours.
 */
export const MAX_CIPHERTEXT_CHARS = 65536;

/*
 * A rolling window on sending, per sender per recipient.
 *
 * Nothing bounded how fast one person could write to another: the size cap
 * limits a single message and the block list is a decision the recipient has to
 * make after the fact, so until they made it, one sender could fill their
 * thread as fast as the network allowed. The recipient cannot even skim what
 * arrived -- every row is ciphertext they must unlock to read -- so flooding is
 * cheaper to do than to undo.
 *
 * The counter is the messages table itself. A thread IS the sender-recipient
 * pair, so counting this sender's rows inside it is exactly "per sender per
 * recipient" with no second table to keep, and nothing retained that outlives
 * the messages.
 *
 * 20 in 10 minutes is well above a conversation and well below a flood.
 */
export const SEND_WINDOW_MINUTES = 10;
export const SEND_WINDOW_MAX = 20;

export class RateLimited extends Error {
  constructor() {
    super('Too many messages to this person in a short time.');
    this.name = 'RateLimited';
  }
}

export interface MessengerIdentity {
  emailHash: string;
  publicKey: string;
  wrappedPrivate: string;
  wrapIv: string;
  kdfSalt: string;
  kdfIterations: number;
}

export interface StoredMessage {
  id: number;
  threadId: string;
  senderEmailHash: string;
  ciphertext: string;
  iv: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface ThreadSummary {
  id: string;
  otherEmailHash: string;
  lastMessageAt: Date;
  unread: number;
}

/* ------------------------------------------------------------------ keystore */

/**
 * Store a freshly minted keypair.
 *
 * `wrappedPrivate` is ciphertext under a passphrase the server never receives,
 * so this row is inert to whoever reads the table.
 *
 * Deliberately INSERT-only, not an upsert. Overwriting a keypair silently makes
 * every message already sealed to the old public half permanently unreadable,
 * with no error at the moment of loss and no way back. Rotation must be an
 * explicit act that decides what happens to the existing history, so it does
 * not get here by way of someone double-submitting a setup form.
 */
export async function createIdentity(identity: MessengerIdentity): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `INSERT INTO messenger_identities
         (email_hash, public_key, wrapped_private, wrap_iv, kdf_salt, kdf_iterations)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        identity.emailHash,
        identity.publicKey,
        identity.wrappedPrivate,
        identity.wrapIv,
        identity.kdfSalt,
        identity.kdfIterations,
      ],
    );
  });
  increment('messenger.identity.created');
}

export async function getIdentity(emailHash: string): Promise<MessengerIdentity | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{
      email_hash: string;
      public_key: string;
      wrapped_private: string;
      wrap_iv: string;
      kdf_salt: string;
      kdf_iterations: number;
    }>(
      `SELECT email_hash, public_key, wrapped_private, wrap_iv, kdf_salt, kdf_iterations
         FROM messenger_identities WHERE email_hash = $1`,
      [emailHash],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      emailHash: r.email_hash,
      publicKey: r.public_key,
      wrappedPrivate: r.wrapped_private,
      wrapIv: r.wrap_iv,
      kdfSalt: r.kdf_salt,
      kdfIterations: r.kdf_iterations,
    };
  });
}

/**
 * Just the public half, for sealing to someone.
 *
 * Separate from getIdentity so that the common case -- looking up a recipient
 * in order to write to them -- never pulls that person's wrapped private key
 * into a response handler that has no business holding it. The blob is useless
 * without the passphrase, but the narrower query cannot leak what it does not
 * select.
 */
export async function getPublicKey(emailHash: string): Promise<string | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ public_key: string }>(
      'SELECT public_key FROM messenger_identities WHERE email_hash = $1',
      [emailHash],
    );
    return rows.length ? rows[0].public_key : null;
  });
}

/**
 * Public keys for many addresses in one round trip.
 *
 * The thread list needs the correspondent's key for every row, and calling
 * getPublicKey() inside the map issued one query per thread -- the same N+1 the
 * neighbouring getProfilesFor() exists to avoid, against the same list of
 * hashes. Absent rows are simply missing from the Map, so a caller reads
 * `map.get(hash) ?? null` and gets what getPublicKey would have returned.
 *
 * @param emailHashes - addresses to resolve; duplicates and blanks are fine
 * @returns Map from email hash to public key, omitting those with no identity
 */
export async function getPublicKeysFor(emailHashes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(emailHashes)].filter(Boolean);
  if (unique.length === 0) return new Map();

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ email_hash: string; public_key: string }>(
      'SELECT email_hash, public_key FROM messenger_identities WHERE email_hash = ANY($1)',
      [unique],
    );
    return new Map(rows.map((r) => [r.email_hash, r.public_key]));
  });
}

/* -------------------------------------------------------------------- blocks */

export async function isBlocked(byEmailHash: string, otherEmailHash: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject(
      `SELECT 1 FROM messenger_blocks
        WHERE (email_hash = $1 AND blocked_email_hash = $2)
           OR (email_hash = $2 AND blocked_email_hash = $1)
        LIMIT 1`,
      [byEmailHash, otherEmailHash],
    );
    return rows.length > 0;
  });
}

export async function block(emailHash: string, blockedEmailHash: string): Promise<void> {
  if (emailHash === blockedEmailHash) return;
  await withConnection(async (client) => {
    await client.queryObject(
      `INSERT INTO messenger_blocks (email_hash, blocked_email_hash)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [emailHash, blockedEmailHash],
    );
  });
  increment('messenger.blocked');
}

export async function unblock(emailHash: string, blockedEmailHash: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      'DELETE FROM messenger_blocks WHERE email_hash = $1 AND blocked_email_hash = $2',
      [emailHash, blockedEmailHash],
    );
  });
}

/* ------------------------------------------------------------------- threads */

/**
 * The canonical pair ordering.
 *
 * The table's UNIQUE constraint is on (a_email_hash, b_email_hash), which only
 * means "one thread per pair" if every writer sorts the pair the same way.
 * Unsorted, (alice, bob) and (bob, alice) are two rows: two people each holding
 * one half of a conversation, each seeing only what they sent, with no error
 * anywhere. A CHECK constraint in the migration enforces the ordering at the
 * database so this cannot be got wrong by a caller that skips this function.
 */
function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * Find or create the thread between two people.
 *
 * The advisory lock, and the pattern, come from
 * lib/questionnaire-session.ts:121-133: without it two simultaneous first
 * messages both read zero rows and both INSERT, and one loses to the unique
 * constraint after the caller has already decided it has a thread. Locking on
 * the pair rather than on one participant means two unrelated conversations
 * never serialise against each other.
 */
export async function findOrCreateThread(x: string, y: string): Promise<string> {
  const [a, b] = orderedPair(x, y);

  return await withTransaction(async (client) => {
    await client.queryObject('SELECT pg_advisory_xact_lock(hashtext($1))', [`${a}:${b}`]);

    const existing = await client.queryObject<{ id: string }>(
      'SELECT id FROM messenger_threads WHERE a_email_hash = $1 AND b_email_hash = $2',
      [a, b],
    );
    if (existing.rows.length) return existing.rows[0].id;

    const created = await client.queryObject<{ id: string }>(
      `INSERT INTO messenger_threads (a_email_hash, b_email_hash)
       VALUES ($1, $2) RETURNING id`,
      [a, b],
    );
    increment('messenger.thread.created');
    return created.rows[0].id;
  });
}

/** Whether this identity is one of the thread's two participants. */
export async function isParticipant(threadId: string, emailHash: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject(
      `SELECT 1 FROM messenger_threads
        WHERE id = $1 AND (a_email_hash = $2 OR b_email_hash = $2) LIMIT 1`,
      [threadId, emailHash],
    );
    return rows.length > 0;
  });
}

/**
 * Every thread this identity is in, most recent first, with unread counts.
 *
 * One query rather than a list plus a count per row. Unread is "sent by the
 * other party and not yet marked read" -- your own messages are never unread to
 * you, which is why the count filters on sender rather than on read_at alone.
 */
export async function listThreads(emailHash: string): Promise<ThreadSummary[]> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{
      id: string;
      other_email_hash: string;
      last_message_at: Date;
      unread: bigint;
    }>(
      `SELECT t.id,
              CASE WHEN t.a_email_hash = $1 THEN t.b_email_hash ELSE t.a_email_hash END
                AS other_email_hash,
              t.last_message_at,
              COUNT(m.id) FILTER (
                WHERE m.sender_email_hash <> $1 AND m.read_at IS NULL
              ) AS unread
         FROM messenger_threads t
         LEFT JOIN messenger_messages m ON m.thread_id = t.id
        WHERE t.a_email_hash = $1 OR t.b_email_hash = $1
        GROUP BY t.id, other_email_hash, t.last_message_at
        ORDER BY t.last_message_at DESC
        LIMIT 200`,
      [emailHash],
    );

    return rows.map((r) => ({
      id: r.id,
      otherEmailHash: r.other_email_hash,
      lastMessageAt: r.last_message_at,
      unread: Number(r.unread),
    }));
  });
}

/* ------------------------------------------------------------------ messages */

export interface SendParams {
  senderEmailHash: string;
  recipientEmailHash: string;
  ciphertext: string;
  iv: string;
}

/**
 * Store one sealed message.
 *
 * Every precondition is checked here rather than in the route, because there is
 * more than one caller shape and a check that lives in a handler is a check the
 * next handler forgets. Order matters: identity, then consent, then blocks --
 * cheapest and most-likely-to-fail first, and none of them reveal more than the
 * caller could already infer.
 *
 * Throws on refusal. Nothing here returns a status a caller can overlook.
 */
export async function sendMessage(params: SendParams): Promise<{ id: number; threadId: string }> {
  const { senderEmailHash, recipientEmailHash, ciphertext, iv } = params;

  if (senderEmailHash === recipientEmailHash) {
    throw new Blocked();
  }
  if (!ciphertext || ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    increment('messenger.rejected.oversize');
    throw new Error('Message is empty or too large.');
  }

  // A recipient with no keypair cannot have had anything sealed to them, so a
  // ciphertext addressed to one was not produced by our client and would be
  // unreadable forever. Refuse rather than store an unopenable row.
  const recipientKey = await getPublicKey(recipientEmailHash);
  if (!recipientKey) {
    increment('messenger.rejected.no_recipient_key');
    throw new NoIdentity();
  }

  if (await isBlocked(senderEmailHash, recipientEmailHash)) {
    increment('messenger.rejected.blocked');
    throw new Blocked();
  }

  const threadId = await findOrCreateThread(senderEmailHash, recipientEmailHash);

  /*
   * Checked after the thread is resolved and before anything is written, so a
   * refused send leaves no message and does not move last_message_at or the
   * recipient's unread count.
   */
  const recentlySent = await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ n: bigint }>(
      `SELECT COUNT(*)::bigint AS n
         FROM messenger_messages
        WHERE thread_id = $1
          AND sender_email_hash = $2
          AND created_at > NOW() - ($3 || ' minutes')::interval`,
      [threadId, senderEmailHash, String(SEND_WINDOW_MINUTES)],
    );
    return Number(rows[0]?.n ?? 0);
  });

  if (recentlySent >= SEND_WINDOW_MAX) {
    increment('messenger.rejected.rate_limited');
    throw new RateLimited();
  }

  const id = await withTransaction(async (client) => {
    const { rows } = await client.queryObject<{ id: number }>(
      `INSERT INTO messenger_messages
         (thread_id, sender_email_hash, ciphertext, iv, byte_len)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [threadId, senderEmailHash, ciphertext, iv, ciphertext.length],
    );
    await client.queryObject(
      'UPDATE messenger_threads SET last_message_at = NOW() WHERE id = $1',
      [threadId],
    );
    return rows[0].id;
  });

  increment('messenger.sent');
  return { id, threadId };
}

/**
 * Messages in a thread, oldest first.
 *
 * `after` is a keyset cursor on the monotonic id, which is what the client
 * polls with -- an offset would re-send everything each tick and would skip a
 * message inserted between two polls.
 *
 * The caller MUST have established participation first; this does not check,
 * because it is also used by the polling path where the check already ran.
 */
interface MessageRow {
  id: number;
  thread_id: string;
  sender_email_hash: string;
  ciphertext: string;
  iv: string;
  created_at: Date;
  read_at: Date | null;
}

function toStoredMessage(r: MessageRow): StoredMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    senderEmailHash: r.sender_email_hash,
    ciphertext: r.ciphertext,
    iv: r.iv,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

export async function listMessages(
  threadId: string,
  opts: { after?: number; limit?: number } = {},
): Promise<StoredMessage[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const after = opts.after ?? 0;

  /*
   * With no cursor this is an opening read, and it must return the NEWEST page
   * rather than the oldest. `id > 0 ORDER BY id ASC LIMIT 200` reads as a
   * bounded query and is one, but on a thread with more than 200 messages it
   * hands back the first 200 ever sent -- so a long correspondence opens on its
   * own beginning, and the most recent message is unreachable until the client
   * has paged forward through everything before it.
   *
   * Cursored reads keep going forward from `after`, which is what the poll and
   * the incremental tail-fetch both want; only the opening read flips.
   */
  if (!opts.after) {
    return await withConnection(async (client) => {
      const { rows } = await client.queryObject<MessageRow>(
        `SELECT id, thread_id, sender_email_hash, ciphertext, iv, created_at, read_at
           FROM (
             SELECT id, thread_id, sender_email_hash, ciphertext, iv, created_at, read_at
               FROM messenger_messages
              WHERE thread_id = $1
              ORDER BY id DESC
              LIMIT $2
           ) newest
          ORDER BY id ASC`,
        [threadId, limit],
      );
      return rows.map(toStoredMessage);
    });
  }

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<MessageRow>(
      `SELECT id, thread_id, sender_email_hash, ciphertext, iv, created_at, read_at
         FROM messenger_messages
        WHERE thread_id = $1 AND id > $2
        ORDER BY id ASC
        LIMIT $3`,
      [threadId, after, limit],
    );

    return rows.map(toStoredMessage);
  });
}

/**
 * Mark the other party's messages in a thread as read.
 *
 * Never touches your own: a sender marking their own message read would make
 * the unread count in listThreads wrong in a way that is invisible until
 * someone notices a badge that never clears.
 */
export async function markRead(threadId: string, readerEmailHash: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE messenger_messages SET read_at = NOW()
        WHERE thread_id = $1 AND sender_email_hash <> $2 AND read_at IS NULL`,
      [threadId, readerEmailHash],
    );
  });
}

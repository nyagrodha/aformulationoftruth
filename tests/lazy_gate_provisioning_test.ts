/**
 * Lazy gate provisioning: no key material is minted until the transaction,
 * holding the per-email advisory lock, has established that no linked gate
 * row already exists.
 *
 * Why. The eager scheme minted gate token B, pushed its identity to the key
 * box and stored Q0-Q1 ciphertext BEFORE createQuestionnaireSession ran. On a
 * resume the transaction then re-linked the prior gate row A, and everything
 * minted for B was orphaned: the identity sat on the key box until the 30-day
 * shred, and the unlinked fresh_gate_responses row and its Q0-Q1 ciphertext
 * (undeletable by the runtime role -- migration 007 grants no DELETE) sat in
 * Postgres FOREVER, break-glass-openable. The only winning move is not to
 * write: provision inside the transaction, only when needed.
 *
 * buildFreshGateProvisioner is the testable seam for the ordering rules the
 * old inline route code carried as comments; the database-backed cases assert
 * that the transaction invokes it exactly when planSupersede says to.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildFreshGateProvisioner, type FreshGateDeps, freshGateState } from '../lib/gate-provision.ts';

const hasDb = Boolean(Deno.env.get('DATABASE_URL'));

const TOKEN = 'b1b1b1b1-c2c2-d3d3-e4e4-f5f5f5f5f5f5';

interface StoredAnswer {
  sessionId: string;
  questionIndex: number;
  answer: string;
  skipped: boolean;
  recipients: string[];
}

/**
 * Fake deps that append a name to `log` per call, so tests can assert the one
 * thing the ordering comments in the old route could only describe: what runs
 * before what.
 */
function fakeDeps(
  log: string[],
  over: Partial<FreshGateDeps> = {},
): { deps: FreshGateDeps; stored: StoredAnswer[] } {
  const stored: StoredAnswer[] = [];
  const deps: FreshGateDeps = {
    breakglassRecipient: () => {
      log.push('breakglass');
      return 'age1breakglass';
    },
    generateKeypair: () => {
      log.push('keygen');
      return Promise.resolve({ identity: 'AGE-SECRET-KEY-TEST', recipient: 'age1session' });
    },
    pushIdentity: (_sessionId, _identity) => {
      log.push('push');
      return Promise.resolve();
    },
    encryptEmail: (_plaintext, recipients) => {
      log.push('encrypt-email');
      return Promise.resolve(`enc[${recipients.join('+')}]`);
    },
    storeAnswer: (args) => {
      log.push(`store-q${args.questionIndex}`);
      stored.push({
        sessionId: args.sessionId,
        questionIndex: args.questionIndex,
        answer: args.answer,
        skipped: args.skipped,
        recipients: args.recipients,
      });
      return Promise.resolve();
    },
    mintToken: () => TOKEN,
    ...over,
  };
  return { deps, stored };
}

function fakeClient(log: string[], inserts: unknown[][]) {
  return {
    queryObject: (_sql: string, args?: unknown[]) => {
      log.push('insert-row');
      inserts.push(args ?? []);
      return Promise.resolve({} as unknown);
    },
  };
}

Deno.test('provisioner - the irreversible answer store runs LAST, after push and row insert', () => {
  // The Rust gate exposes /api/store and no delete. Inside the transaction the
  // row insert rolls back and the pushed identity can be shredded; the stored
  // ciphertext cannot be withdrawn by anyone. It must therefore come after
  // everything that can still fail.
  const log: string[] = [];
  const { deps } = fakeDeps(log);
  const provision = buildFreshGateProvisioner(
    { email: 'a@b.c', q0: 'joy', q1: 'fear' },
    freshGateState(),
    deps,
  );
  return provision(fakeClient(log, [])).then(() => {
    assert(log.indexOf('push') < log.indexOf('insert-row'), 'identity push must precede the row');
    assert(log.indexOf('insert-row') < log.indexOf('store-q0'), 'row must precede the gate store');
    assert(log.indexOf('store-q0') < log.indexOf('store-q1'));
  });
});

Deno.test('provisioner - break-glass is read before any key material exists', async () => {
  // Unconfigured break-glass must refuse the submission before a key is
  // generated or pushed: encrypting to the session key alone would produce
  // data that dies with the key, and a pushed identity for a refused
  // submission is a key-box orphan.
  const log: string[] = [];
  const { deps } = fakeDeps(log, {
    breakglassRecipient: () => {
      log.push('breakglass');
      throw new Error('BREAKGLASS_AGE_RECIPIENT not configured');
    },
  });
  const state = freshGateState();
  const provision = buildFreshGateProvisioner({ email: 'a@b.c', q0: '', q1: '' }, state, deps);

  await assertRejects(() => provision(fakeClient(log, [])));
  assertEquals(state.gateToken, null);
  assertEquals(state.pushed, false);
  assertEquals(log, ['breakglass']);
});

Deno.test('provisioner - the token is recorded in state BEFORE the push', () => {
  // An ambiguous push failure (ssh killed at its deadline) may or may not have
  // left a key on the box. The caller can only shred what it can name, so the
  // token must be visible in state before the transport starts.
  const log: string[] = [];
  const state = freshGateState();
  const { deps } = fakeDeps(log, {
    pushIdentity: () => {
      assertEquals(state.gateToken, TOKEN);
      assertEquals(state.pushed, false);
      return Promise.resolve();
    },
  });
  const provision = buildFreshGateProvisioner({ email: 'a@b.c', q0: '', q1: '' }, state, deps);
  return provision(fakeClient(log, [])).then(() => {
    assertEquals(state.pushed, true);
  });
});

Deno.test('provisioner - a failed push leaves pushed=false and stores nothing', async () => {
  const log: string[] = [];
  const state = freshGateState();
  const { deps } = fakeDeps(log, {
    pushIdentity: () => Promise.reject(new Error('transport failed')),
  });
  const provision = buildFreshGateProvisioner({ email: 'a@b.c', q0: 'x', q1: 'y' }, state, deps);

  await assertRejects(() => provision(fakeClient(log, [])));
  assertEquals(state.pushed, false);
  assert(!log.includes('insert-row'));
  assert(!log.includes('store-q0'));
});

Deno.test('provisioner - a failed gate store still reports the push, so the caller can shred', async () => {
  const log: string[] = [];
  const state = freshGateState();
  const { deps } = fakeDeps(log, {
    storeAnswer: () => Promise.reject(new Error('gate unavailable')),
  });
  const provision = buildFreshGateProvisioner({ email: 'a@b.c', q0: 'x', q1: 'y' }, state, deps);

  await assertRejects(() => provision(fakeClient(log, [])));
  assertEquals(state.pushed, true);
  assertEquals(state.gateToken, TOKEN);
});

Deno.test('provisioner - returns the minted token and files the row under it', async () => {
  const log: string[] = [];
  const inserts: unknown[][] = [];
  const { deps } = fakeDeps(log);
  const provision = buildFreshGateProvisioner(
    { email: 'a@b.c', q0: 'joy', q1: 'fear' },
    freshGateState(),
    deps,
  );

  const token = await provision(fakeClient(log, inserts));
  assertEquals(token, TOKEN);
  assertEquals(inserts.length, 1);
  // gate_token, session_pubkey (the recipient, never the identity), encrypted email
  assertEquals(inserts[0][0], TOKEN);
  assertEquals(inserts[0][1], 'age1session');
  assertEquals(inserts[0][2], 'enc[age1session+age1breakglass]');
});

Deno.test('provisioner - answers are sealed to the session key plus break-glass', async () => {
  const log: string[] = [];
  const { deps, stored } = fakeDeps(log);
  const provision = buildFreshGateProvisioner(
    { email: 'a@b.c', q0: 'joy', q1: '' },
    freshGateState(),
    deps,
  );

  await provision(fakeClient(log, []));
  assertEquals(stored.length, 2);
  for (const s of stored) {
    assertEquals(s.sessionId, TOKEN);
    assertEquals(s.recipients, ['age1session', 'age1breakglass']);
  }
  assertEquals(stored[0].skipped, false);
  assertEquals(stored[1].skipped, true); // empty answer travels as an explicit skip
});

// --------------------------------------------------- database-backed cases

Deno.test({
  name: 'lazy gate (db) - a first-timer provisions inside the transaction and gets linked',
  ignore: !hasDb,
  async fn() {
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');
    const { parseQuestionOrder } = await import('../lib/questionnaire.ts');

    const emailHash = randomHash();
    const tokenA = crypto.randomUUID();

    const first = await createQuestionnaireSession(emailHash, async (client) => {
      await client.queryObject(
        `INSERT INTO fresh_gate_responses (gate_token, session_pubkey, encrypted_email)
         VALUES ($1, $2, $3)`,
        [tokenA, 'age1test', 'enc-test'],
      );
      return tokenA;
    });

    const linked = await linkedSessionOf(tokenA);
    assertEquals(linked, first.sessionId);

    // The row this very transaction inserted counts as answered gate
    // questions: the order excludes Q0-Q1.
    const order = parseQuestionOrder(first.questionOrder);
    assertEquals(order.length, 33);
    assert(!order.includes(0) && !order.includes(1));

    await cleanup(emailHash, [tokenA]);
  },
});

Deno.test({
  name: 'lazy gate (db) - resuming with a linked gate row never invokes the provisioner',
  ignore: !hasDb,
  async fn() {
    // The whole point of the change. Under the eager scheme this path minted a
    // keypair, pushed it, and wrote a gate row plus Q0-Q1 ciphertext that
    // nothing would ever link or read -- the row undeletable by the runtime
    // role, the ciphertext break-glass-openable, forever. Here the provisioner
    // is simply never consulted, so there is nothing to orphan.
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');

    const emailHash = randomHash();
    const tokenA = crypto.randomUUID();

    await createQuestionnaireSession(emailHash, async (client) => {
      await client.queryObject(
        `INSERT INTO fresh_gate_responses (gate_token, session_pubkey, encrypted_email)
         VALUES ($1, $2, $3)`,
        [tokenA, 'age1test', 'enc-test'],
      );
      return tokenA;
    });

    let invoked = false;
    const second = await createQuestionnaireSession(emailHash, () => {
      invoked = true;
      return Promise.reject(new Error('a resume with a linked gate row must not provision'));
    });

    assertEquals(second.resuming, true);
    assertEquals(invoked, false);
    // Row A travelled to the new session; it is the ONLY row for this walk.
    assertEquals(await linkedSessionOf(tokenA), second.sessionId);

    await cleanup(emailHash, [tokenA]);
  },
});

Deno.test({
  name: 'lazy gate (db) - a provisioner failure rolls back the row AND the session',
  ignore: !hasDb,
  async fn() {
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');
    const { withConnection } = await import('../lib/db.ts');

    const emailHash = randomHash();
    const tokenB = crypto.randomUUID();

    await assertRejects(() =>
      createQuestionnaireSession(emailHash, async (client) => {
        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token, session_pubkey, encrypted_email)
           VALUES ($1, $2, $3)`,
          [tokenB, 'age1test', 'enc-test'],
        );
        throw new Error('gate store failed after the insert');
      })
    );

    const counts = await withConnection(async (client) => {
      const g = await client.queryObject<{ n: bigint }>(
        `SELECT COUNT(*)::bigint AS n FROM fresh_gate_responses WHERE gate_token = $1`,
        [tokenB],
      );
      const s = await client.queryObject<{ n: bigint }>(
        `SELECT COUNT(*)::bigint AS n FROM fresh_questionnaire_sessions WHERE email_hash = $1`,
        [emailHash],
      );
      return { gate: Number(g.rows[0].n), sessions: Number(s.rows[0].n) };
    });
    assertEquals(counts, { gate: 0, sessions: 0 });
  },
});

Deno.test({
  name: 'lazy gate (db) - the magic-link path still links an existing gate row by token',
  ignore: !hasDb,
  async fn() {
    // /api/auth/magic-link passes a bare token for a row that already exists;
    // no provisioning is involved and none must be required.
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');
    const { withConnection } = await import('../lib/db.ts');

    const emailHash = randomHash();
    const tokenA = crypto.randomUUID();

    await withConnection(async (client) => {
      await client.queryObject(
        `INSERT INTO fresh_gate_responses (gate_token, session_pubkey, encrypted_email)
         VALUES ($1, $2, $3)`,
        [tokenA, 'age1test', 'enc-test'],
      );
    });

    const created = await createQuestionnaireSession(emailHash, tokenA);
    assertEquals(await linkedSessionOf(tokenA), created.sessionId);

    await cleanup(emailHash, [tokenA]);
  },
});

// ------------------------------------------------------------------ helpers

function randomHash(): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}

async function linkedSessionOf(gateToken: string): Promise<string | null> {
  const { withConnection } = await import('../lib/db.ts');
  return await withConnection(async (client) => {
    const r = await client.queryObject<{ linked_session_id: string | null }>(
      `SELECT linked_session_id FROM fresh_gate_responses WHERE gate_token = $1`,
      [gateToken],
    );
    return r.rows[0]?.linked_session_id ?? null;
  });
}

async function cleanup(emailHash: string, gateTokens: string[]): Promise<void> {
  const { withConnection } = await import('../lib/db.ts');
  await withConnection(async (client) => {
    await client.queryObject(
      `DELETE FROM fresh_gate_responses WHERE gate_token = ANY($1)`,
      [gateTokens],
    );
    await client.queryObject(
      `DELETE FROM fresh_questionnaire_sessions WHERE email_hash = $1`,
      [emailHash],
    );
  });
}

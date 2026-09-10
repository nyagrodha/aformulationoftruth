/**
 * Fresh-gate provisioning, packaged as a GateProvisioner for
 * createQuestionnaireSession to invoke lazily.
 *
 * This code used to run inline in /api/gate-submit, EAGERLY -- token, keypair,
 * key-box push, fresh_gate_responses row and Q0-Q1 ciphertext all existed
 * before anyone asked whether the respondent was resuming. On a resume the
 * session transaction then re-linked the prior gate row, and everything
 * minted here was orphaned: the identity sat on the key box until the 30-day
 * shred, and the unlinked row plus its Q0-Q1 ciphertext -- which the runtime
 * role cannot delete (migration 007 grants no DELETE on
 * gate_encrypted_answers) -- sat in Postgres forever, break-glass-openable.
 *
 * Wrapped as a provisioner, none of it runs until the transaction, holding
 * the per-email advisory lock, has established that no linked gate row
 * already carries this respondent's walk. A resume provisions nothing, so a
 * resume can orphan nothing -- and no longer needs the key box to be up.
 *
 * The ordering inside is load-bearing and each step has a reason:
 *
 *   1. break-glass first: local, and throws when unconfigured -- fail before
 *      any key material exists rather than strand a key for a submission we
 *      then refuse over a missing env var.
 *   2. record the token in state, THEN push: ssh killed at its deadline may
 *      or may not have landed the key, and the caller can only shred what it
 *      can name.
 *   3. the row insert goes through the TRANSACTION's client, so a later
 *      failure anywhere in the transaction takes the row with it.
 *   4. the gate store is LAST: the Rust gate exposes /api/store and no
 *      delete, so it is the one step that cannot be unwound. Everything that
 *      can still fail must have already succeeded. (The transaction commits
 *      after this returns; if THAT fails, the caller shreds the pushed
 *      identity -- see state.pushed -- and the leftover ciphertext has no
 *      live key. That residue is the rare-failure remnant of what the eager
 *      flow produced on every single resume.)
 */

import { GATE_QUESTIONS, storeEncryptedAnswer } from './gate_encrypt.ts';
import { ageEncryptTo } from './age-encrypt.ts';
import { breakglassRecipient, generateSessionKeypair, pushIdentity } from './session-keys.ts';
import type { GateProvisioner } from './questionnaire-session.ts';

/**
 * What the provisioner has done so far, visible to the CALLER even when the
 * provisioner throws mid-way. The route's catch block reads this to decide
 * whether a key must be withdrawn from the key box: the transaction rollback
 * reclaims the row, but nothing reclaims a pushed identity by itself.
 */
export interface FreshGateState {
  /** Set before the push; null means nothing was ever minted. */
  gateToken: string | null;
  /** True only after the identity definitely reached the key box. */
  pushed: boolean;
}

export function freshGateState(): FreshGateState {
  return { gateToken: null, pushed: false };
}

/** The gate form's submission, trimmed. Empty answers travel as skips. */
export interface FreshGateInput {
  email: string;
  q0: string;
  q1: string;
}

export interface FreshGateAnswer {
  sessionId: string;
  questionIndex: number;
  questionText: string;
  answer: string;
  skipped: boolean;
  recipients: string[];
}

/**
 * Injectable so the ordering rules above are TESTABLE rather than comments:
 * tests/lazy_gate_provisioning_test.ts hands in recording fakes and asserts
 * what runs before what. Production callers omit this and get the real thing.
 */
export interface FreshGateDeps {
  breakglassRecipient: () => string;
  generateKeypair: () => Promise<{ identity: string; recipient: string }>;
  pushIdentity: (sessionId: string, identity: string) => Promise<void>;
  encryptEmail: (plaintext: string, recipients: string[]) => Promise<string>;
  storeAnswer: (args: FreshGateAnswer) => Promise<void>;
  mintToken: () => string;
}

const realDeps: FreshGateDeps = {
  breakglassRecipient,
  generateKeypair: generateSessionKeypair,
  pushIdentity,
  encryptEmail: ageEncryptTo,
  storeAnswer: storeEncryptedAnswer,
  mintToken: () => crypto.randomUUID(),
};

export function buildFreshGateProvisioner(
  input: FreshGateInput,
  state: FreshGateState,
  deps: FreshGateDeps = realDeps,
): GateProvisioner {
  return async (client) => {
    const breakglass = deps.breakglassRecipient();

    const gateToken = deps.mintToken();
    state.gateToken = gateToken;

    const keypair = await deps.generateKeypair();
    await deps.pushIdentity(gateToken, keypair.identity);
    state.pushed = true;

    const recipients = [keypair.recipient, breakglass];

    // The row carries the session's PUBLIC key and the address encrypted to
    // it. Neither is readable here: this process holds recipients, never
    // identities.
    const encryptedEmail = await deps.encryptEmail(input.email, recipients);
    await client.queryObject(
      `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer, session_pubkey, encrypted_email)
       VALUES ($1, NULL, NULL, $2, $3)`,
      [gateToken, recipients[0], encryptedEmail],
    );

    // Last, and unrecoverable. Encrypted to this session's key plus
    // break-glass rather than the gate's global recipient. The plaintext
    // columns q0_answer/q1_answer stay NULL -- nothing reads them, and
    // storing plaintext would break the promise the gate form makes.
    await deps.storeAnswer({
      sessionId: gateToken,
      questionIndex: 0,
      questionText: GATE_QUESTIONS[0],
      answer: input.q0,
      skipped: input.q0.length === 0,
      recipients,
    });
    await deps.storeAnswer({
      sessionId: gateToken,
      questionIndex: 1,
      questionText: GATE_QUESTIONS[1],
      answer: input.q1,
      skipped: input.q1.length === 0,
      recipients,
    });

    return gateToken;
  };
}

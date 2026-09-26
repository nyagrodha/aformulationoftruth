# Mesh Bridge — Site Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give aformulationoftruth.com the server half of the Meshtastic ⇄ Proust bridge:
- a bearer-authenticated API that hands out the day's question, records that it was sent, and stores answers heard on the mesh
- a public, server-rendered `/mesh` page listing each question with its answers

**Architecture:**
- **`lib/mesh.ts`** holds the pure rules: question cycling, input cleaning and validation, bearer check. It is unit-tested with no database.
- **`lib/mesh-store.ts`** is the only file that talks to Postgres, through the existing `withConnection` pool. It is tested against an isolated opt-in test database, the same way `tests/delivery_queue_test.ts` is.
- **Five thin Fresh route files** under `routes/api/mesh/`, plus `routes/mesh.tsx` for the page.
- **Mesh answers live in two new tables**, deliberately never joined to `gate_encrypted_answers`, sessions or email hashes.

**Tech Stack:** Deno 2.9, Fresh 1.7.3 + Preact, deno.land/x/postgres, `$std` assert/crypto, `preact-render-to-string`.

**Spec:** `~/Projects/ddwaterfall/docs/superpowers/specs/2026-09-25-mesh-proust-bridge-design.md`, section 2 and **both Amendments sections**. The amendments override the body where they differ (`sent_id`, bidi stripping, 422, the 60-question wall).

## Global Constraints

- Branch: `feat/mesh-bridge` from `production` (the deployed branch). Never commit to `production` directly.
- Code style follows `deno.json` fmt: single quotes, 2-space indent, semicolons, line width 120. Run `deno fmt` on every new file.
- Errors are logged **by category only**, never with the thrown error object, which can carry the connection string. This matches `routes/api/responses/delivered.ts`.
- An unset `MESH_BRIDGE_TOKEN` **fails closed** with 503. A wrong or missing bearer gets 401. The comparison is constant-time and checks length first.
- Question cycle: indexes **2 → 34**, then back to **2**. Question text is `getQuestionById(i).english` from `lib/questions_dakshinaparvanuvadam.ts`; no copy of the list is made.
- `from_id` must match `^![0-9a-f]{8}$`. `short_name` is at most 8 characters after cleaning. `text` is at most **240 bytes** after cleaning, cut on character boundaries.
- Limits: **3 answers per node per sending** of a question, and **60 answers per Chicago day** in total. A repeat of the same `(from_id, packet_id)` returns **200 and changes nothing**, and is checked *before* the limits.
- One question per **America/Chicago** calendar day (`UNIQUE sent_day`). A second send that day gets 409 with the stored row.
- The public page never shows a `from_id` and never uses `dangerouslySetInnerHTML`. The wall query doesn't select `from_id` at all.
- Deploy is operator-gated. The migration is applied by hand as admin, because `a4m_app` has DML-only grants.

## Review Focus

1. **A reply containing Unicode bidi override characters** (`U+202E`) or zero-width tricks. The expected result is that they're stripped, so one answer can't reorder its neighbours on the public page. Pinned in Task 1 (`cleanText strips bidi controls`).
2. **An answer whose `rx_time` predates every sending of that question**, for example after a bridge clock fault or a replay of an old packet. The expected result is 422, never linking it to a random evening. Pinned in Task 2 (`answer with no prior sending is refused`).
3. **The bridge retrying an answer after the node's limit was reached** (the first POST succeeded but the response was lost). The expected result is 200 duplicate, not 429, so the outbox clears. Pinned in Task 2 (`a replay after the limit is still a duplicate`).
4. **The same question index coming round again five weeks later.** The expected result is that answers attach to the right evening, and the per-node limit resets for the new sending. Pinned in Task 2 (`second cycle of a question starts a fresh limit`).
5. **The database being unreachable when someone opens `/mesh`.** The expected result is that the page still renders and says the wall can't be read, not a 500 stack page. Pinned in Task 4 (`an unavailable wall still renders a page`).

---

### Task 1: `lib/mesh.ts`, the pure rules

**Files:**
- Create: `lib/mesh.ts`
- Test: `lib/mesh_test.ts`

**Interfaces:**
- Produces:
  - `FIRST_INDEX = 2`, `LAST_INDEX = 34`, `MAX_TEXT_BYTES = 240`, `MAX_SHORT_NAME = 8`, `MAX_PER_NODE_PER_QUESTION = 3`, `MAX_PER_DAY = 60`, `FROM_ID: RegExp`
  - `nextIndex(last: number | null): number`
  - `questionText(index: number): string | null`
  - `cleanText(raw: string, maxBytes: number): string`
  - `cleanShortName(raw: string): string`
  - `interface AnswerInput { question_index: number; packet_id: number; from_id: string; short_name: string; text: string; via: 'reply' | 'dm'; rx_at: Date }`
  - `type Checked<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `validateAnswer(body: unknown): Checked<AnswerInput>`
  - `validateSent(body: unknown): Checked<{ question_index: number; packet_id: number }>`
  - `validateForget(body: unknown): Checked<{ from_id: string }>`
  - `json(body: unknown, status?: number): Response`
  - `bridgeAuth(req: Request, configured: string | undefined): Response | null` (null = allowed)

- [ ] **Step 1: Switch to the branch** (created with this plan's commit, from `production`)

```bash
cd ~/Projects/aformulationoftruth && git switch feat/mesh-bridge
```

- [ ] **Step 2: Write the failing tests**

`lib/mesh_test.ts`:

```ts
import { assert, assertEquals } from '$std/assert/mod.ts';
import {
  bridgeAuth,
  cleanShortName,
  cleanText,
  FIRST_INDEX,
  LAST_INDEX,
  nextIndex,
  questionText,
  validateAnswer,
  validateForget,
  validateSent,
} from './mesh.ts';

const GOOD = {
  question_index: 12,
  packet_id: 2020797967,
  from_id: '!62f61b44',
  short_name: 'AURA',
  text: 'Kindness, mostly.',
  via: 'reply',
  rx_time: 1790388510,
};

Deno.test('nextIndex starts at 2, steps by one, wraps 34 back to 2', () => {
  assertEquals(nextIndex(null), FIRST_INDEX);
  assertEquals(nextIndex(2), 3);
  assertEquals(nextIndex(33), 34);
  assertEquals(nextIndex(LAST_INDEX), FIRST_INDEX);
});

Deno.test('nextIndex never hands out a gate question', () => {
  assertEquals(nextIndex(0), FIRST_INDEX);
  assertEquals(nextIndex(1), FIRST_INDEX);
});

Deno.test('questionText reads the canonical list and refuses the gate questions', () => {
  assertEquals(questionText(2), 'What is the trait you most deplore in yourself?');
  assertEquals(questionText(34), 'What is your motto?');
  assertEquals(questionText(0), null);
  assertEquals(questionText(35), null);
  assertEquals(questionText(2.5), null);
});

Deno.test('every mesh question fits one Meshtastic text with tag and site name', () => {
  // P<n> <text> Reply to answer · aformulationoftruth.com/mesh  -- the bridge's exact frame
  for (let i = FIRST_INDEX; i <= LAST_INDEX; i++) {
    const line = `P${i} ${questionText(i)} Reply to answer · aformulationoftruth.com/mesh`;
    assert(new TextEncoder().encode(line).length <= 200, `Q${i} is ${line.length} chars`);
  }
});

Deno.test('cleanText turns controls into spaces and collapses runs', () => {
  assertEquals(cleanText('a\nb\t\tc\u0007d', 240), 'a b c d');
  assertEquals(cleanText('  padded  ', 240), 'padded');
});

Deno.test('cleanText strips bidi controls', () => {
  assertEquals(cleanText('abc‮gfed‬', 240), 'abcgfed');
  assertEquals(cleanText('x⁦y⁩‏z', 240), 'xyz');
});

Deno.test('cleanText cuts on a character boundary, never inside one', () => {
  const s = 'a'.repeat(239) + 'é'; // é is 2 bytes: 241 total
  assertEquals(cleanText(s, 240), 'a'.repeat(239));
  assertEquals(cleanText('🌱🌱', 7), '🌱'); // 4 bytes each
});

Deno.test('cleanShortName keeps at most 8 characters', () => {
  assertEquals(cleanShortName('  A4T  '), 'A4T');
  assertEquals(cleanShortName('abcdefghijk'), 'abcdefgh');
});

Deno.test('validateAnswer accepts the bridge payload and converts rx_time', () => {
  const r = validateAnswer(GOOD);
  assert(r.ok);
  assertEquals(r.value.rx_at.getTime(), 1790388510 * 1000);
  assertEquals(r.value.via, 'reply');
});

Deno.test('validateAnswer refuses each malformed field', () => {
  const bad: Record<string, unknown>[] = [
    { ...GOOD, question_index: 1 },
    { ...GOOD, question_index: 35 },
    { ...GOOD, packet_id: 0 },
    { ...GOOD, packet_id: 2 ** 32 },
    { ...GOOD, from_id: '!62F61B44' },
    { ...GOOD, from_id: '62f61b44' },
    { ...GOOD, short_name: '   ' },
    { ...GOOD, text: '\n\t ' },
    { ...GOOD, via: 'channel' },
    { ...GOOD, rx_time: 'yesterday' },
    { ...GOOD, rx_time: -5 },
  ];
  for (const b of bad) assertEquals(validateAnswer(b).ok, false, JSON.stringify(b));
  assertEquals(validateAnswer(null).ok, false);
  assertEquals(validateAnswer('text').ok, false);
});

Deno.test('validateSent and validateForget', () => {
  assert(validateSent({ question_index: 2, packet_id: 7 }).ok);
  assertEquals(validateSent({ question_index: 1, packet_id: 7 }).ok, false);
  assert(validateForget({ from_id: '!04e1419c' }).ok);
  assertEquals(validateForget({ from_id: 'everyone' }).ok, false);
});

function req(auth?: string): Request {
  return new Request('http://localhost/api/mesh/question/next', {
    headers: auth ? { Authorization: auth } : {},
  });
}

Deno.test('bridgeAuth fails closed when no token is configured', () => {
  assertEquals(bridgeAuth(req('Bearer anything'), undefined)?.status, 503);
  assertEquals(bridgeAuth(req('Bearer anything'), '')?.status, 503);
});

Deno.test('bridgeAuth refuses missing, wrong and wrong-length tokens', () => {
  const t = 'correct-token-123';
  assertEquals(bridgeAuth(req(), t)?.status, 401);
  assertEquals(bridgeAuth(req('Bearer correct-token-124'), t)?.status, 401);
  assertEquals(bridgeAuth(req('Bearer short'), t)?.status, 401);
  assertEquals(bridgeAuth(req(`Basic ${t}`), t)?.status, 401);
  assertEquals(bridgeAuth(req(`Bearer ${t}`), t), null);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `deno test --allow-env --allow-read lib/mesh_test.ts 2>&1 | tail -5`
Expected: FAIL: `Module not found ".../lib/mesh.ts"`

- [ ] **Step 4: Write `lib/mesh.ts`**

```ts
/**
 * Mesh ⇄ Proust bridge — the pure rules.
 *
 * The bridge (ddwaterfall on logwood) asks one Proust question a day on the
 * Meshtastic LongFast channel and posts back what it hears. Everything here
 * is decided without the database, so it is tested without one: which
 * question comes next, what an acceptable answer looks like, and whether a
 * caller holds the bridge token.
 *
 * Mesh answers are PUBLIC BY DESIGN — they were broadcast in plaintext over
 * the air and are shown on /mesh. They never touch gate_encrypted_answers.
 *
 * Spec: ddwaterfall/docs/superpowers/specs/2026-09-25-mesh-proust-bridge-design.md
 */

import { timingSafeEqual } from '$std/crypto/timing_safe_equal.ts';
import { getQuestionById } from './questions_dakshinaparvanuvadam.ts';

/** Q0-1 are the site's gate questions; the mesh cycle skips them. */
export const FIRST_INDEX = 2;
export const LAST_INDEX = 34;
export const MAX_TEXT_BYTES = 240;
export const MAX_SHORT_NAME = 8;
export const MAX_PER_NODE_PER_QUESTION = 3;
export const MAX_PER_DAY = 60;
export const FROM_ID = /^![0-9a-f]{8}$/;

export function nextIndex(last: number | null): number {
  if (last === null || last < FIRST_INDEX || last >= LAST_INDEX) return FIRST_INDEX;
  return last + 1;
}

export function questionText(index: number): string | null {
  if (!Number.isInteger(index) || index < FIRST_INDEX || index > LAST_INDEX) return null;
  return getQuestionById(index)?.english ?? null;
}

// C0, DEL and C1 controls become spaces. Bidi embeddings/overrides/isolates and
// directional marks are removed outright: on a public page one of them can
// visually reorder the answers around it.
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

export function cleanText(raw: string, maxBytes: number): string {
  const tidy = raw.replace(BIDI, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of tidy) { // iterates code points, so a cut never splits one
    const n = enc.encode(ch).length;
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out.trimEnd();
}

export function cleanShortName(raw: string): string {
  return [...cleanText(raw, 64)].slice(0, MAX_SHORT_NAME).join('').trim();
}

export interface AnswerInput {
  question_index: number;
  packet_id: number;
  from_id: string;
  short_name: string;
  text: string;
  via: 'reply' | 'dm';
  rx_at: Date;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function meshIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= FIRST_INDEX && v <= LAST_INDEX;
}

/** Meshtastic packet ids are nonzero uint32. */
function packetId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff;
}

export function validateAnswer(body: unknown): Checked<AnswerInput> {
  if (!isRecord(body)) return { ok: false, error: 'body' };
  const { question_index, packet_id, from_id, short_name, text, via, rx_time } = body;
  if (!meshIndex(question_index)) return { ok: false, error: 'question_index' };
  if (!packetId(packet_id)) return { ok: false, error: 'packet_id' };
  if (typeof from_id !== 'string' || !FROM_ID.test(from_id)) return { ok: false, error: 'from_id' };
  const name = typeof short_name === 'string' ? cleanShortName(short_name) : '';
  if (!name) return { ok: false, error: 'short_name' };
  const clean = typeof text === 'string' ? cleanText(text, MAX_TEXT_BYTES) : '';
  if (!clean) return { ok: false, error: 'text' };
  if (via !== 'reply' && via !== 'dm') return { ok: false, error: 'via' };
  if (typeof rx_time !== 'number' || !Number.isFinite(rx_time) || rx_time <= 0) {
    return { ok: false, error: 'rx_time' };
  }
  return {
    ok: true,
    value: { question_index, packet_id, from_id, short_name: name, text: clean, via, rx_at: new Date(rx_time * 1000) },
  };
}

export function validateSent(body: unknown): Checked<{ question_index: number; packet_id: number }> {
  if (!isRecord(body)) return { ok: false, error: 'body' };
  const { question_index, packet_id } = body;
  if (!meshIndex(question_index)) return { ok: false, error: 'question_index' };
  if (!packetId(packet_id)) return { ok: false, error: 'packet_id' };
  return { ok: true, value: { question_index, packet_id } };
}

export function validateForget(body: unknown): Checked<{ from_id: string }> {
  if (!isRecord(body) || typeof body.from_id !== 'string' || !FROM_ID.test(body.from_id)) {
    return { ok: false, error: 'from_id' };
  }
  return { ok: true, value: { from_id: body.from_id } };
}

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

/** Constant-time and length-safe, as in routes/api/responses/delivered.ts. */
function tokenMatches(presented: string, configured: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(configured);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/** null = allowed. An unset token fails closed: it must not mean "anyone may write". */
export function bridgeAuth(req: Request, configured: string | undefined): Response | null {
  if (!configured) {
    console.error('[mesh] MESH_BRIDGE_TOKEN not set; refusing');
    return json({ ok: false }, 503);
  }
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !tokenMatches(header.slice(7), configured)) {
    return json({ ok: false }, 401);
  }
  return null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `deno fmt lib/mesh.ts lib/mesh_test.ts && deno test --allow-env --allow-read lib/mesh_test.ts 2>&1 | tail -3`
Expected: `ok | 13 passed | 0 failed`

- [ ] **Step 6: Commit**

```bash
git add lib/mesh.ts lib/mesh_test.ts
git commit -m "feat(mesh): pure rules for the Proust bridge -- cycle 2..34, clean answers, fail-closed bearer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration and `lib/mesh-store.ts`, with isolated-DB tests

**Files:**
- Create: `db/migrations/019_mesh_bridge.sql`
- Create: `lib/mesh-store.ts`
- Test: `tests/mesh_store_test.ts`

**Interfaces:**
- Consumes: `AnswerInput`, `MAX_PER_NODE_PER_QUESTION`, `MAX_PER_DAY`, `questionText` from Task 1; `withConnection` from `lib/db.ts`.
- Produces:
  - `interface SentRow { id: number; question_index: number; packet_id: number; sent_at: Date }`
  - `lastSent(): Promise<SentRow | null>`
  - `recordSent(questionIndex: number, packetId: number): Promise<{ status: 'inserted' | 'conflict'; row: SentRow }>`
  - `type AnswerResult = 'inserted' | 'duplicate' | 'rate_node' | 'rate_day' | 'no_question'`
  - `insertAnswer(a: AnswerInput): Promise<AnswerResult>`
  - `forget(fromId: string): Promise<number>` (rows hidden)
  - `interface WallAnswer { short_name: string; text: string; rx_at: Date }`
  - `interface WallQuestion { question_index: number; text: string; sent_at: Date; answers: WallAnswer[] }`
  - `wall(): Promise<WallQuestion[]>` (newest first, last 60 sendings, visible answers oldest first)

- [ ] **Step 1: One-time local test database (operator)**

The DB tests need a local Postgres role. Ask the operator to run this once (it needs sudo):

```bash
read -rsp 'local test DB password: ' MESH_TEST_PGPASS; echo; export MESH_TEST_PGPASS
sudo -u postgres psql -c "CREATE ROLE arbe LOGIN CREATEDB PASSWORD '$MESH_TEST_PGPASS'"
PGPASSWORD="$MESH_TEST_PGPASS" createdb -h localhost -U arbe a4t_mesh_test_1
```

The tests then run with:

```bash
export DATABASE_URL="postgres://arbe:${MESH_TEST_PGPASS}@localhost:5432/a4t_mesh_test_1" MESH_TEST_DATABASE=a4t_mesh_test_1
```

Without these the DB tests are **ignored** rather than failing, as `delivery_queue_test.ts` is. Record in the ledger whether they ran.

- [ ] **Step 2: Write the migration**

`db/migrations/019_mesh_bridge.sql`:

```sql
-- 019: Meshtastic <-> Proust bridge.
--
-- PUBLIC-BY-DESIGN DATA. These answers were broadcast in plaintext on the
-- public LongFast channel and are shown on /mesh. They are deliberately NOT
-- joined to gate_encrypted_answers, sessions, or email hashes, and nothing
-- here should ever be. Apply by hand as admin: a4m_app has DML-only grants.
--
-- Spec: ddwaterfall/docs/superpowers/specs/2026-09-25-mesh-proust-bridge-design.md

CREATE TABLE IF NOT EXISTS mesh_questions_sent (
  id             serial PRIMARY KEY,
  question_index smallint NOT NULL CHECK (question_index BETWEEN 2 AND 34),
  packet_id      bigint   NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  -- One question per Chicago evening; a second send that day is refused.
  sent_day       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date UNIQUE
);

CREATE TABLE IF NOT EXISTS mesh_answers (
  id             serial PRIMARY KEY,
  -- Which evening's question this answers: question_index repeats every ~5 weeks.
  sent_id        integer  NOT NULL REFERENCES mesh_questions_sent(id),
  question_index smallint NOT NULL,
  packet_id      bigint   NOT NULL,
  from_id        text     NOT NULL,
  short_name     text     NOT NULL,
  text           text     NOT NULL CHECK (octet_length(text) <= 240),
  via            text     NOT NULL CHECK (via IN ('reply', 'dm')),
  rx_at          timestamptz NOT NULL,
  -- Set by a DM of "forget". Kept, not deleted, so a replay cannot resurrect it.
  hidden         boolean  NOT NULL DEFAULT false,
  UNIQUE (from_id, packet_id)
);

CREATE INDEX IF NOT EXISTS mesh_answers_sent_idx ON mesh_answers (sent_id) WHERE NOT hidden;

GRANT SELECT, INSERT, UPDATE ON mesh_questions_sent, mesh_answers TO a4m_app;
GRANT USAGE ON SEQUENCE mesh_questions_sent_id_seq, mesh_answers_id_seq TO a4m_app;
```

- [ ] **Step 3: Write the failing tests**

`tests/mesh_store_test.ts`:

```ts
/** Explicit opt-in; this suite cannot touch the production database. */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { closePool, withConnection } from '../lib/db.ts';
import { type AnswerInput, questionText } from '../lib/mesh.ts';
import { forget, insertAnswer, lastSent, recordSent, wall } from '../lib/mesh-store.ts';

const database = Deno.env.get('MESH_TEST_DATABASE');
if (database) {
  if (!/^a4t_mesh_test_[0-9]+$/.test(database)) throw Error('isolated test database required');
  const url = new URL(Deno.env.get('DATABASE_URL')!);
  url.pathname = '/' + database;
  Deno.env.set('DATABASE_URL', url.toString());
}

const sql = (q: string, args: unknown[] = []) => withConnection((c) => c.queryObject(q, args));

async function reset() {
  const migration = await Deno.readTextFile(new URL('../db/migrations/019_mesh_bridge.sql', import.meta.url));
  // The test role is not a4m_app; the grants are for production only.
  await sql(migration.replace(/^GRANT .*$/gm, ''));
  await sql('TRUNCATE mesh_answers, mesh_questions_sent RESTART IDENTITY CASCADE');
}

/** Insert a sending on a given past day, bypassing the one-per-day default. */
async function sentOn(index: number, packet: number, day: string, at: string) {
  await sql('INSERT INTO mesh_questions_sent (question_index, packet_id, sent_day, sent_at) VALUES ($1,$2,$3,$4)', [
    index,
    packet,
    day,
    at,
  ]);
}

function answer(over: Partial<AnswerInput> = {}): AnswerInput {
  return {
    question_index: 12,
    packet_id: 1000,
    from_id: '!62f61b44',
    short_name: 'AURA',
    text: 'Kindness.',
    via: 'reply',
    rx_at: new Date('2026-09-20T01:00:00Z'),
    ...over,
  };
}

Deno.test({
  name: 'mesh store: sendings, answers, limits, forget, wall',
  ignore: !database,
  sanitizeResources: false,
  async fn(t) {
    try {
      await reset();

      await t.step('no sending yet', async () => {
        assertEquals(await lastSent(), null);
      });

      await t.step('a second send on the same Chicago day conflicts with the stored row', async () => {
        const first = await recordSent(2, 111);
        assertEquals(first.status, 'inserted');
        const again = await recordSent(3, 222);
        assertEquals(again.status, 'conflict');
        assertEquals([again.row.question_index, again.row.packet_id], [2, 111]);
        assertEquals((await lastSent())?.packet_id, 111);
      });

      await reset();
      await sentOn(12, 5000, '2026-09-19', '2026-09-20T00:00:00Z');

      await t.step('answer is stored against its sending', async () => {
        assertEquals(await insertAnswer(answer()), 'inserted');
      });

      await t.step('the same packet again is a duplicate, not a second row', async () => {
        assertEquals(await insertAnswer(answer({ text: 'changed' })), 'duplicate');
        const n = await sql('SELECT count(*)::int AS n FROM mesh_answers');
        assertEquals((n.rows[0] as { n: number }).n, 1);
      });

      await t.step('answer with no prior sending is refused', async () => {
        assertEquals(
          await insertAnswer(answer({ packet_id: 1001, rx_at: new Date('2026-09-19T00:00:00Z') })),
          'no_question',
        );
        assertEquals(await insertAnswer(answer({ packet_id: 1002, question_index: 13 })), 'no_question');
      });

      await t.step('a node may answer a sending three times', async () => {
        assertEquals(await insertAnswer(answer({ packet_id: 1003 })), 'inserted');
        assertEquals(await insertAnswer(answer({ packet_id: 1004 })), 'inserted');
        assertEquals(await insertAnswer(answer({ packet_id: 1005 })), 'rate_node');
      });

      await t.step('a replay after the limit is still a duplicate', async () => {
        assertEquals(await insertAnswer(answer({ packet_id: 1004 })), 'duplicate');
      });

      await t.step('second cycle of a question starts a fresh limit', async () => {
        await sentOn(12, 6000, '2026-10-24', '2026-10-25T00:00:00Z');
        const later = new Date('2026-10-25T02:00:00Z');
        assertEquals(await insertAnswer(answer({ packet_id: 2001, rx_at: later })), 'inserted');
        const r = await sql('SELECT s.packet_id::int AS q FROM mesh_answers a JOIN mesh_questions_sent s ON s.id = a.sent_id WHERE a.packet_id = 2001');
        assertEquals((r.rows[0] as { q: number }).q, 6000);
      });

      await t.step('sixty answers a day in total', async () => {
        const day = new Date('2026-10-25T03:00:00Z');
        for (let i = 0; i < 59; i++) {
          const from = '!' + (0x10000000 + i).toString(16);
          assertEquals(await insertAnswer(answer({ from_id: from, packet_id: 3000 + i, rx_at: day })), 'inserted');
        }
        assertEquals(await insertAnswer(answer({ from_id: '!7fffffff', packet_id: 4000, rx_at: day })), 'rate_day');
      });

      await t.step('forget hides a node, and a replay does not bring it back', async () => {
        assertEquals(await forget('!62f61b44'), 4);
        assertEquals(await insertAnswer(answer()), 'duplicate');
        const q = (await wall()).find((w) => w.sent_at.toISOString() === '2026-09-20T00:00:00.000Z');
        assert(q);
        assertEquals(q.answers.length, 0);
      });

      await t.step('wall is newest first, carries question text, never a from_id', async () => {
        const w = await wall();
        assertEquals(w.map((x) => x.sent_at.toISOString()), ['2026-10-25T00:00:00.000Z', '2026-09-20T00:00:00.000Z']);
        assertEquals(w[0].text, questionText(12));
        assert(w[0].answers.length > 0);
        for (const a of w[0].answers) assertEquals(Object.keys(a).sort(), ['rx_at', 'short_name', 'text']);
      });
    } finally {
      await closePool();
    }
  },
});
```

- [ ] **Step 4: Run to verify it fails**

Run (with the Step 1 env exported): `deno test --allow-net --allow-read --allow-env tests/mesh_store_test.ts 2>&1 | tail -5`
Expected: FAIL: `Module not found ".../lib/mesh-store.ts"`

- [ ] **Step 5: Write `lib/mesh-store.ts`**

```ts
/**
 * Mesh ⇄ Proust bridge — the only code that touches the mesh tables.
 *
 * Public-by-design data (see db/migrations/019_mesh_bridge.sql). wall() never
 * selects from_id: the page cannot show what it was never given.
 */

import { withConnection } from './db.ts';
import { type AnswerInput, MAX_PER_DAY, MAX_PER_NODE_PER_QUESTION, questionText } from './mesh.ts';

export interface SentRow {
  id: number;
  question_index: number;
  packet_id: number;
  sent_at: Date;
}

// bigint and count(*) arrive as JS bigint from deno-postgres; cast in SQL instead.
const SENT_COLUMNS = 'id, question_index::int AS question_index, packet_id::float8 AS packet_id, sent_at';
const CHICAGO_TODAY = "(now() AT TIME ZONE 'America/Chicago')::date";

export function lastSent(): Promise<SentRow | null> {
  return withConnection(async (c) => {
    const r = await c.queryObject<SentRow>(
      `SELECT ${SENT_COLUMNS} FROM mesh_questions_sent ORDER BY sent_at DESC, id DESC LIMIT 1`,
    );
    return r.rows[0] ?? null;
  });
}

export function recordSent(
  questionIndex: number,
  packetId: number,
): Promise<{ status: 'inserted' | 'conflict'; row: SentRow }> {
  return withConnection(async (c) => {
    const ins = await c.queryObject<SentRow>(
      `INSERT INTO mesh_questions_sent (question_index, packet_id) VALUES ($1, $2)
       ON CONFLICT (sent_day) DO NOTHING RETURNING ${SENT_COLUMNS}`,
      [questionIndex, packetId],
    );
    if (ins.rows[0]) return { status: 'inserted' as const, row: ins.rows[0] };
    const today = await c.queryObject<SentRow>(
      `SELECT ${SENT_COLUMNS} FROM mesh_questions_sent WHERE sent_day = ${CHICAGO_TODAY}`,
    );
    return { status: 'conflict' as const, row: today.rows[0] };
  });
}

export type AnswerResult = 'inserted' | 'duplicate' | 'rate_node' | 'rate_day' | 'no_question';

/**
 * Order matters: a duplicate is recognised BEFORE the limits, so a bridge
 * retrying an answer whose 201 it never saw gets 200 and clears its outbox,
 * even after the node's limit has since been reached.
 *
 * The limits are check-then-insert, not one atomic statement. With a single
 * bridge posting serially the worst case is one answer over a limit, which
 * is not worth a serializable transaction.
 */
export function insertAnswer(a: AnswerInput): Promise<AnswerResult> {
  return withConnection(async (c) => {
    const dup = await c.queryObject(
      'SELECT 1 FROM mesh_answers WHERE from_id = $1 AND packet_id = $2',
      [a.from_id, a.packet_id],
    );
    if (dup.rows.length) return 'duplicate';

    const sent = await c.queryObject<{ id: number }>(
      `SELECT id FROM mesh_questions_sent WHERE question_index = $1 AND sent_at <= $2
       ORDER BY sent_at DESC LIMIT 1`,
      [a.question_index, a.rx_at],
    );
    const sentId = sent.rows[0]?.id;
    if (sentId === undefined) return 'no_question';

    const perNode = await c.queryObject<{ n: number }>(
      'SELECT count(*)::int AS n FROM mesh_answers WHERE sent_id = $1 AND from_id = $2',
      [sentId, a.from_id],
    );
    if (perNode.rows[0].n >= MAX_PER_NODE_PER_QUESTION) return 'rate_node';

    const perDay = await c.queryObject<{ n: number }>(
      `SELECT count(*)::int AS n FROM mesh_answers
       WHERE (rx_at AT TIME ZONE 'America/Chicago')::date = ($1::timestamptz AT TIME ZONE 'America/Chicago')::date`,
      [a.rx_at],
    );
    if (perDay.rows[0].n >= MAX_PER_DAY) return 'rate_day';

    const ins = await c.queryObject(
      `INSERT INTO mesh_answers (sent_id, question_index, packet_id, from_id, short_name, text, via, rx_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (from_id, packet_id) DO NOTHING RETURNING id`,
      [sentId, a.question_index, a.packet_id, a.from_id, a.short_name, a.text, a.via, a.rx_at],
    );
    return ins.rows.length ? 'inserted' : 'duplicate';
  });
}

export function forget(fromId: string): Promise<number> {
  return withConnection(async (c) => {
    const r = await c.queryObject('UPDATE mesh_answers SET hidden = true WHERE from_id = $1 AND NOT hidden', [fromId]);
    return r.rowCount ?? 0;
  });
}

export interface WallAnswer {
  short_name: string;
  text: string;
  rx_at: Date;
}

export interface WallQuestion {
  question_index: number;
  text: string;
  sent_at: Date;
  answers: WallAnswer[];
}

const WALL_QUESTIONS = 60;

export function wall(): Promise<WallQuestion[]> {
  return withConnection(async (c) => {
    const qs = await c.queryObject<{ id: number; question_index: number; sent_at: Date }>(
      `SELECT id, question_index::int AS question_index, sent_at FROM mesh_questions_sent
       ORDER BY sent_at DESC, id DESC LIMIT ${WALL_QUESTIONS}`,
    );
    if (!qs.rows.length) return [];
    const ans = await c.queryObject<WallAnswer & { sent_id: number }>(
      `SELECT sent_id, short_name, text, rx_at FROM mesh_answers
       WHERE sent_id = ANY($1) AND NOT hidden ORDER BY rx_at ASC, id ASC`,
      [qs.rows.map((q) => q.id)],
    );
    return qs.rows.map((q) => ({
      question_index: q.question_index,
      text: questionText(q.question_index) ?? '',
      sent_at: q.sent_at,
      answers: ans.rows
        .filter((a) => a.sent_id === q.id)
        .map(({ short_name, text, rx_at }) => ({ short_name, text, rx_at })),
    }));
  });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `deno fmt db/migrations/019_mesh_bridge.sql lib/mesh-store.ts tests/mesh_store_test.ts 2>/dev/null; deno test --allow-net --allow-read --allow-env tests/mesh_store_test.ts 2>&1 | tail -4`
Expected: `ok | 1 passed (11 steps) | 0 failed`. If the Step 1 database isn't set up: `ignored`. Record that in the ledger. Don't claim the DB behaviour is verified.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/019_mesh_bridge.sql lib/mesh-store.ts tests/mesh_store_test.ts
git commit -m "feat(mesh): tables and store -- answers link to their evening, dupes before limits, forget sticks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bridge API routes

**Files:**
- Create: `routes/api/mesh/question/next.ts`, `routes/api/mesh/question/sent.ts`, `routes/api/mesh/question/current.ts`, `routes/api/mesh/answers.ts`, `routes/api/mesh/forget.ts`
- Test: `tests/mesh_routes_test.ts`

**Interfaces:**
- Consumes: Task 1 `bridgeAuth`, `json`, `nextIndex`, `questionText`, `validateAnswer`, `validateSent`, `validateForget`; Task 2 `lastSent`, `recordSent`, `insertAnswer`, `forget`.
- Produces (HTTP contract Plan B's bridge relies on; all need `Authorization: Bearer <MESH_BRIDGE_TOKEN>`):
  - `GET /api/mesh/question/next` → 200 `{ok:true, question_index, text}`
  - `POST /api/mesh/question/sent` `{question_index, packet_id}` → 201 `{ok:true, question_index, packet_id}` | 409 `{ok:false, question_index, packet_id}` (today's stored row) | 400
  - `GET /api/mesh/question/current` → 200 `{ok:true, question_index, packet_id, sent_at, text}` | 404 `{ok:false}`
  - `POST /api/mesh/answers` `{question_index, packet_id, from_id, short_name, text, rx_time, via}` → 201 inserted | 200 `{ok:true, duplicate:true}` | 429 `{ok:false, reason:'rate_node'|'rate_day'}` | 422 `{ok:false, reason:'no_question'}` | 400 `{ok:false, error:<field>}`
  - `POST /api/mesh/forget` `{from_id}` → 200 `{ok:true, hidden:<n>}` | 400
  - Every route: 401 bad bearer, 503 token unset, 500 on DB failure.

- [ ] **Step 1: Write the failing tests**

`tests/mesh_routes_test.ts`:

```ts
/** Auth and validation run everywhere; the DB flow is opt-in like tests/mesh_store_test.ts. */
import { assertEquals } from '$std/assert/mod.ts';
import { closePool, withConnection } from '../lib/db.ts';
import { handler as next } from '../routes/api/mesh/question/next.ts';
import { handler as sent } from '../routes/api/mesh/question/sent.ts';
import { handler as current } from '../routes/api/mesh/question/current.ts';
import { handler as answers } from '../routes/api/mesh/answers.ts';
import { handler as forgetRoute } from '../routes/api/mesh/forget.ts';

const TOKEN = 'test-bridge-token-0123456789';
Deno.env.set('MESH_BRIDGE_TOKEN', TOKEN);

const database = Deno.env.get('MESH_TEST_DATABASE');
if (database) {
  if (!/^a4t_mesh_test_[0-9]+$/.test(database)) throw Error('isolated test database required');
  const url = new URL(Deno.env.get('DATABASE_URL')!);
  url.pathname = '/' + database;
  Deno.env.set('DATABASE_URL', url.toString());
}

function req(path: string, method = 'GET', body?: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// deno-lint-ignore no-explicit-any
const call = (fn: any, r: Request): Promise<Response> => (fn as CallableFunction)(r, {});

const ANSWER = {
  question_index: 2,
  packet_id: 777,
  from_id: '!62f61b44',
  short_name: 'AURA',
  text: 'Impatience.',
  via: 'dm',
  // An hour ahead: the answer must postdate the sending the test makes later.
  rx_time: Math.floor(Date.now() / 1000) + 3600,
};

Deno.test('every mesh route refuses a missing or wrong bearer', async () => {
  const cases: [unknown, Request][] = [
    [next.GET, req('/api/mesh/question/next', 'GET', undefined, null)],
    [current.GET, req('/api/mesh/question/current', 'GET', undefined, 'x')],
    [sent.POST, req('/api/mesh/question/sent', 'POST', { question_index: 2, packet_id: 1 }, null)],
    [answers.POST, req('/api/mesh/answers', 'POST', ANSWER, TOKEN + 'x')],
    [forgetRoute.POST, req('/api/mesh/forget', 'POST', { from_id: '!62f61b44' }, null)],
  ];
  for (const [fn, r] of cases) assertEquals((await call(fn, r)).status, 401, r.url);
});

Deno.test('an unset token fails closed with 503', async () => {
  Deno.env.delete('MESH_BRIDGE_TOKEN');
  try {
    assertEquals((await call(next.GET, req('/api/mesh/question/next'))).status, 503);
  } finally {
    Deno.env.set('MESH_BRIDGE_TOKEN', TOKEN);
  }
});

Deno.test('malformed bodies are 400 before any database work', async () => {
  const r1 = await call(answers.POST, req('/api/mesh/answers', 'POST', { ...ANSWER, from_id: 'everyone' }));
  assertEquals(r1.status, 400);
  assertEquals((await r1.json()).error, 'from_id');
  const r2 = await call(sent.POST, req('/api/mesh/question/sent', 'POST', { question_index: 0, packet_id: 1 }));
  assertEquals(r2.status, 400);
  const r3 = await call(forgetRoute.POST, new Request('http://localhost/api/mesh/forget', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: '{not json',
  }));
  assertEquals(r3.status, 400);
});

Deno.test({
  name: 'mesh routes: the bridge conversation end to end',
  ignore: !database,
  sanitizeResources: false,
  async fn(t) {
    const sql = (q: string) => withConnection((c) => c.queryObject(q));
    try {
      const migration = await Deno.readTextFile(new URL('../db/migrations/019_mesh_bridge.sql', import.meta.url));
      await sql(migration.replace(/^GRANT .*$/gm, ''));
      await sql('TRUNCATE mesh_answers, mesh_questions_sent RESTART IDENTITY CASCADE');

      await t.step('current is 404 before anything was sent', async () => {
        assertEquals((await call(current.GET, req('/api/mesh/question/current'))).status, 404);
      });

      await t.step('next hands out Q2 with its text', async () => {
        const r = await call(next.GET, req('/api/mesh/question/next'));
        assertEquals(await r.json(), {
          ok: true,
          question_index: 2,
          text: 'What is the trait you most deplore in yourself?',
        });
      });

      await t.step('sent records it; a retry of the same send gets 409 with the same packet', async () => {
        const body = { question_index: 2, packet_id: 4242 };
        assertEquals((await call(sent.POST, req('/api/mesh/question/sent', 'POST', body))).status, 201);
        const again = await call(sent.POST, req('/api/mesh/question/sent', 'POST', body));
        assertEquals(again.status, 409);
        assertEquals((await again.json()).packet_id, 4242);
      });

      await t.step('current and next reflect the send', async () => {
        const cur = await (await call(current.GET, req('/api/mesh/question/current'))).json();
        assertEquals([cur.question_index, cur.packet_id], [2, 4242]);
        const nx = await (await call(next.GET, req('/api/mesh/question/next'))).json();
        assertEquals(nx.question_index, 3);
      });

      await t.step('answers: 201, then 200 duplicate on retry', async () => {
        assertEquals((await call(answers.POST, req('/api/mesh/answers', 'POST', ANSWER))).status, 201);
        const again = await call(answers.POST, req('/api/mesh/answers', 'POST', ANSWER));
        assertEquals(again.status, 200);
        assertEquals((await again.json()).duplicate, true);
      });

      await t.step('an answer to a question never sent is 422', async () => {
        const r = await call(answers.POST, req('/api/mesh/answers', 'POST', { ...ANSWER, question_index: 9, packet_id: 1 }));
        assertEquals(r.status, 422);
      });

      await t.step('the fourth answer from one node is 429', async () => {
        for (const p of [778, 779]) {
          assertEquals((await call(answers.POST, req('/api/mesh/answers', 'POST', { ...ANSWER, packet_id: p }))).status, 201);
        }
        const r = await call(answers.POST, req('/api/mesh/answers', 'POST', { ...ANSWER, packet_id: 780 }));
        assertEquals(r.status, 429);
        assertEquals((await r.json()).reason, 'rate_node');
      });

      await t.step('forget hides the node', async () => {
        const r = await call(forgetRoute.POST, req('/api/mesh/forget', 'POST', { from_id: '!62f61b44' }));
        assertEquals(await r.json(), { ok: true, hidden: 3 });
      });
    } finally {
      await closePool();
    }
  },
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-net --allow-read --allow-env tests/mesh_routes_test.ts 2>&1 | tail -4`
Expected: FAIL: `Module not found ".../routes/api/mesh/question/next.ts"`

- [ ] **Step 3: Write the five routes**

`routes/api/mesh/question/next.ts`:

```ts
/** GET /api/mesh/question/next — the question the bridge should ask tonight. Bearer MESH_BRIDGE_TOKEN. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, nextIndex, questionText } from '../../../../lib/mesh.ts';
import { lastSent } from '../../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async GET(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    try {
      const index = nextIndex((await lastSent())?.question_index ?? null);
      return json({ ok: true, question_index: index, text: questionText(index) });
    } catch {
      console.error('[mesh] next question lookup failed');
      return json({ ok: false }, 500);
    }
  },
};
```

`routes/api/mesh/question/sent.ts`:

```ts
/**
 * POST /api/mesh/question/sent — the bridge sent tonight's question under this packet id.
 * 409 carries today's stored row, so a retry after a lost 201 can see it was its own.
 */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateSent } from '../../../../lib/mesh.ts';
import { recordSent } from '../../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async POST(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'body' }, 400);
    }
    const v = validateSent(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      const { status, row } = await recordSent(v.value.question_index, v.value.packet_id);
      return json(
        { ok: status === 'inserted', question_index: row.question_index, packet_id: row.packet_id },
        status === 'inserted' ? 201 : 409,
      );
    } catch {
      console.error('[mesh] recording a sent question failed');
      return json({ ok: false }, 500);
    }
  },
};
```

`routes/api/mesh/question/current.ts`:

```ts
/** GET /api/mesh/question/current — the latest sending, for a bridge recovering after a restart. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, questionText } from '../../../../lib/mesh.ts';
import { lastSent } from '../../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async GET(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    try {
      const row = await lastSent();
      if (!row) return json({ ok: false }, 404);
      return json({
        ok: true,
        question_index: row.question_index,
        packet_id: row.packet_id,
        sent_at: row.sent_at.toISOString(),
        text: questionText(row.question_index),
      });
    } catch {
      console.error('[mesh] current question lookup failed');
      return json({ ok: false }, 500);
    }
  },
};
```

`routes/api/mesh/answers.ts`:

```ts
/** POST /api/mesh/answers — an answer heard on the mesh. Public by design; see lib/mesh.ts. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateAnswer } from '../../../lib/mesh.ts';
import { type AnswerResult, insertAnswer } from '../../../lib/mesh-store.ts';

const OUTCOME: Record<AnswerResult, [number, Record<string, unknown>]> = {
  inserted: [201, { ok: true }],
  duplicate: [200, { ok: true, duplicate: true }],
  no_question: [422, { ok: false, reason: 'no_question' }],
  rate_node: [429, { ok: false, reason: 'rate_node' }],
  rate_day: [429, { ok: false, reason: 'rate_day' }],
};

export const handler: Handlers = {
  async POST(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'body' }, 400);
    }
    const v = validateAnswer(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      const [status, out] = OUTCOME[await insertAnswer(v.value)];
      return json(out, status);
    } catch {
      console.error('[mesh] storing an answer failed');
      return json({ ok: false }, 500);
    }
  },
};
```

`routes/api/mesh/forget.ts`:

```ts
/** POST /api/mesh/forget — a node DMed "forget": hide everything it posted. */
import { Handlers } from '$fresh/server.ts';
import { bridgeAuth, json, validateForget } from '../../../lib/mesh.ts';
import { forget } from '../../../lib/mesh-store.ts';

export const handler: Handlers = {
  async POST(req) {
    const denied = bridgeAuth(req, Deno.env.get('MESH_BRIDGE_TOKEN'));
    if (denied) return denied;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'body' }, 400);
    }
    const v = validateForget(body);
    if (!v.ok) return json({ ok: false, error: v.error }, 400);
    try {
      return json({ ok: true, hidden: await forget(v.value.from_id) });
    } catch {
      console.error('[mesh] forget failed');
      return json({ ok: false }, 500);
    }
  },
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `deno fmt routes/api/mesh tests/mesh_routes_test.ts && deno test --allow-net --allow-read --allow-env tests/mesh_routes_test.ts 2>&1 | tail -4`
Expected: 3 passed, plus the DB test `ok (8 steps)` with the test DB, or `ignored` without it.

- [ ] **Step 5: Regenerate the Fresh manifest and type-check**

Run: `deno run -A dev.ts build 2>&1 | tail -3; git diff --stat fresh.gen.ts; deno check main.ts 2>&1 | tail -3`
Expected: `fresh.gen.ts` changed and lists the five `routes/api/mesh/...` files; `deno check` prints no errors.

- [ ] **Step 6: Commit**

```bash
git add routes/api/mesh tests/mesh_routes_test.ts fresh.gen.ts
git commit -m "feat(mesh): bridge API -- next/sent/current question, answers, forget; bearer, 409/422/429

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The public `/mesh` page

**Files:**
- Create: `routes/mesh.tsx`
- Test: `routes/mesh_test.tsx`

**Interfaces:**
- Consumes: `wall()`, `WallQuestion` from Task 2; `PageShell` from `components/PageShell.tsx`.
- Produces: `GET /mesh`; exports `MeshData { questions: WallQuestion[]; unavailable?: boolean }` and the default page component.

- [ ] **Step 1: Write the failing tests**

`routes/mesh_test.tsx`:

```tsx
import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import MeshPage, { type MeshData } from './mesh.tsx';

function page(data: MeshData): string {
  return render(<MeshPage {...({ data } as unknown as PageProps<MeshData>)} />);
}

const ONE: MeshData = {
  questions: [{
    question_index: 12,
    text: 'What is your favorite occupation?',
    sent_at: new Date('2026-09-27T00:00:00Z'),
    answers: [
      { short_name: 'AURA', text: 'Weeding at dusk.', rx_at: new Date('2026-09-27T00:05:00Z') },
      { short_name: 'x<b>', text: '<script>alert(1)</script>', rx_at: new Date('2026-09-27T00:06:00Z') },
    ],
  }],
};

Deno.test('mesh page shows the question and its answers under short names', () => {
  const html = page(ONE);
  assertStringIncludes(html, 'What is your favorite occupation?');
  assertStringIncludes(html, 'AURA');
  assertStringIncludes(html, 'Weeding at dusk.');
});

Deno.test('answer text and names are escaped, never markup', () => {
  const html = page(ONE);
  assertEquals(html.includes('<script>alert(1)</script>'), false);
  // Preact escapes '<' (enough to stop any tag opening) and leaves '>' as-is.
  assertStringIncludes(html, '&lt;script>alert(1)&lt;/script>');
  assertEquals(html.includes('x<b>'), false);
});

Deno.test('the page never renders a node id', async () => {
  assertEquals(/![0-9a-f]{8}/.test(page(ONE)), false);
  const source = await Deno.readTextFile(new URL('./mesh.tsx', import.meta.url));
  assertEquals(source.includes('from_id'), false);
  assertEquals(source.includes('dangerouslySetInnerHTML'), false);
});

Deno.test('the footer says what is stored and how to be forgotten', () => {
  const html = page(ONE);
  assertStringIncludes(html, 'as reported by the radio');
  assertStringIncludes(html, 'forget');
  assertStringIncludes(html, 'A4T');
});

Deno.test('an empty wall says so', () => {
  assertStringIncludes(page({ questions: [] }), 'No question has gone out yet');
});

Deno.test('an unavailable wall still renders a page', () => {
  const html = page({ questions: [], unavailable: true });
  assertStringIncludes(html, "can't be read right now");
  assert(html.includes('Heard on the mesh'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test --allow-read --allow-env routes/mesh_test.tsx 2>&1 | tail -3`
Expected: FAIL: `Module not found ".../routes/mesh.tsx"`

- [ ] **Step 3: Write `routes/mesh.tsx`**

```tsx
/**
 * /mesh — Proust questions asked over the Meshtastic LongFast channel, and the
 * answers heard back. Public by design: every answer here was broadcast in
 * plaintext over the air. Server-rendered, no JavaScript. Node ids are never
 * shown; wall() does not even select them.
 */
import { Handlers, PageProps } from '$fresh/server.ts';
import { PageShell } from '../components/PageShell.tsx';
import { wall, type WallQuestion } from '../lib/mesh-store.ts';

export interface MeshData {
  questions: WallQuestion[];
  unavailable?: boolean;
}

export const handler: Handlers<MeshData> = {
  async GET(_req, ctx) {
    try {
      return ctx.render({ questions: await wall() });
    } catch {
      console.error('[mesh] reading the wall failed');
      return ctx.render({ questions: [], unavailable: true });
    }
  },
};

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

export default function MeshPage({ data }: PageProps<MeshData>) {
  return (
    <PageShell
      title='Heard on the mesh - a formulation of truth'
      description='Proust questions asked over the Meshtastic mesh around Madison, and the answers heard back'
    >
      <div class='about-header'>
        <h1>Heard on the mesh</h1>
        <p>Proust questions, asked over the air</p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          Each evening the node <strong>a4mulas4t</strong> (A4T) asks one question from the Proust questionnaire on the
          Meshtastic LongFast channel around Madison. Reply to it in your Meshtastic app, or send A4T a direct message,
          and your answer appears here under your node's short name.
        </p>

        {data.unavailable && <p class='callout'>The wall can't be read right now. Please try again later.</p>}
        {!data.unavailable && data.questions.length === 0 && <p>No question has gone out yet.</p>}

        {data.questions.map((q) => (
          <section key={q.sent_at.toISOString()}>
            <h2>{q.text}</h2>
            <p>
              <small>Asked {DAY.format(q.sent_at)}</small>
            </p>
            {q.answers.length === 0 ? <p><em>No answers heard.</em></p> : (
              <ul>
                {q.answers.map((a) => (
                  <li key={`${a.short_name}-${a.rx_at.toISOString()}`}>
                    <strong>{a.short_name}</strong> — {a.text} <small>({DAY.format(a.rx_at)})</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <h2>What is kept</h2>
        <p>
          For each answer: the question it answers, the text of the answer, and the node's short name as reported by
          the radio, with the time it was heard. Names are not verified — any radio can transmit under any name. Send
          {' '}
          <strong>forget</strong> as a direct message to A4T and every answer from your node is removed from this page.
        </p>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno fmt routes/mesh.tsx routes/mesh_test.tsx && deno test --allow-read --allow-env routes/mesh_test.tsx 2>&1 | tail -3`
Expected: `ok | 6 passed | 0 failed`

- [ ] **Step 5: Regenerate the manifest, type-check, and run the whole suite**

Run: `deno run -A dev.ts build 2>&1 | tail -2; deno check main.ts 2>&1 | tail -3; deno task test lib/ routes/ tests/mesh_store_test.ts tests/mesh_routes_test.ts 2>&1 | tail -4`
Expected: no type errors; all pass (DB suites `ignored` without the test DB). The repo's server-level tests (`tests/*_test.ts` that fetch `TEST_BASE_URL`) need a running server and aren't in scope.

- [ ] **Step 6: Commit**

```bash
git add routes/mesh.tsx routes/mesh_test.tsx fresh.gen.ts
git commit -m "feat(mesh): public /mesh wall -- short names only, escaped, says what is kept and how to forget

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Deploy (operator-gated)

Each step changes production or a shared branch. **Stop and get the operator's explicit OK for each numbered step.**

- [ ] **Step 1: Push the branch and open it for review**

```bash
git push -u origin feat/mesh-bridge
```

- [ ] **Step 2: Merge into `production` (operator decides; this is what `deploy.sh` pulls)**

- [ ] **Step 3: On the server, apply the migration as admin**

```bash
sudo -u postgres psql -d <site database> -f /var/www/aformulationoftruth/db/migrations/019_mesh_bridge.sql
```
Expected: `CREATE TABLE`, `CREATE TABLE`, `CREATE INDEX`, `GRANT`, `GRANT`.

- [ ] **Step 4: Set the token**

Generate it: `openssl rand -base64 32`. Add `MESH_BRIDGE_TOKEN=<value>` to `/var/www/aformulationoftruth/.env`, and give the same value to the bridge (Plan B's `A4T_BRIDGE_TOKEN`). Never echo it into logs or commits.

- [ ] **Step 5: Deploy and check**

```bash
/var/www/deploy.sh
curl -s -o /dev/null -w '%{http_code}\n' https://aformulationoftruth.com/mesh                        # 200
curl -s -o /dev/null -w '%{http_code}\n' https://aformulationoftruth.com/api/mesh/question/current  # 401
curl -s -H "Authorization: Bearer $MESH_BRIDGE_TOKEN" https://aformulationoftruth.com/api/mesh/question/next
# {"ok":true,"question_index":2,"text":"What is the trait you most deplore in yourself?"}
```
If `scripts/smoke.sh` exists on the server, add `/mesh` (expect 200) to its URL list.

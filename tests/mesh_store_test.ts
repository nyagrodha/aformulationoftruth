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
        const r = await sql(
          'SELECT s.packet_id::int AS q FROM mesh_answers a JOIN mesh_questions_sent s ON s.id = a.sent_id WHERE a.packet_id = 2001',
        );
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

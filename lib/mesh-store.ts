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

// deno-postgres hands int8 back as a JS bigint (and float8 as a string), so
// packet_id is selected as-is and converted here: JSON cannot carry a bigint,
// and the bridge compares it against the id it sent.
const SENT_COLUMNS = 'id, question_index::int AS question_index, packet_id, sent_at';
type SentDbRow = Omit<SentRow, 'packet_id'> & { packet_id: bigint };
const toSent = (r: SentDbRow): SentRow => ({ ...r, packet_id: Number(r.packet_id) });
const CHICAGO_DAY_OF_3 = "($3::timestamptz AT TIME ZONE 'America/Chicago')::date";

export function lastSent(): Promise<SentRow | null> {
  return withConnection(async (c) => {
    const r = await c.queryObject<SentDbRow>(
      `SELECT ${SENT_COLUMNS} FROM mesh_questions_sent ORDER BY sent_at DESC, id DESC LIMIT 1`,
    );
    return r.rows[0] ? toSent(r.rows[0]) : null;
  });
}

/**
 * One explicit time drives both statements: the day the INSERT would claim is
 * exactly the day the conflict lookup reads, so a conflict at 23:59:59 can no
 * longer look for its row in the next day and come back empty.
 */
export function recordSent(
  questionIndex: number,
  packetId: number,
  sentAt: Date = new Date(),
): Promise<{ status: 'inserted' | 'conflict'; row: SentRow }> {
  return withConnection(async (c) => {
    const ins = await c.queryObject<SentDbRow>(
      `INSERT INTO mesh_questions_sent (question_index, packet_id, sent_at, sent_day)
       VALUES ($1, $2, $3, ${CHICAGO_DAY_OF_3})
       ON CONFLICT (sent_day) DO NOTHING RETURNING ${SENT_COLUMNS}`,
      [questionIndex, packetId, sentAt],
    );
    if (ins.rows[0]) return { status: 'inserted' as const, row: toSent(ins.rows[0]) };
    const same = await c.queryObject<SentDbRow>(
      `SELECT ${SENT_COLUMNS} FROM mesh_questions_sent WHERE sent_day = ($1::timestamptz AT TIME ZONE 'America/Chicago')::date`,
      [sentAt],
    );
    if (!same.rows[0]) throw new Error('mesh: sent_day conflict without a row');
    return { status: 'conflict' as const, row: toSent(same.rows[0]) };
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

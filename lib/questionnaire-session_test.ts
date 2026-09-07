/**
 * Questionnaire session contract, pinned in the SQL the module ships.
 *
 * The 30-day resume promise, the unlinkability of the opaque token, and the
 * completed-session lockout are all properties of WHERE clauses and column
 * lists. If those drift, no integration test that never hits the cleanup job
 * will notice.
 *
 *   deno test --allow-read lib/questionnaire-session_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('./questionnaire-session.ts', import.meta.url));

function insertColumns(table: string): string[] {
  const needle = `INSERT INTO ${table}`;
  const start = src.indexOf(needle);
  assert(start >= 0, `missing INSERT INTO ${table}`);
  const insert = src.slice(start);
  return insert.slice(insert.indexOf('(') + 1, insert.indexOf(')'))
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

Deno.test('expired sessions are collected from last visit, not minting', () => {
  // The questionnaire page promises thirty days from a respondent's LAST VISIT.
  // Measuring from created_at would delete the session of someone still working.
  assert(
    src.includes("WHERE updated_at < NOW() - INTERVAL '30 days'"),
    'cleanup must key off updated_at',
  );
  assert(
    !/DELETE FROM fresh_questionnaire_sessions[\s\S]{0,120}WHERE created_at/.test(src),
    'cleanup must not key off created_at',
  );
});

Deno.test('the session INSERT never stores the opaque token or a plaintext email', () => {
  const columns = insertColumns('fresh_questionnaire_sessions');
  assertEquals(columns, [
    'session_id',
    'email_hash',
    'question_order',
    'answered_questions',
    'current_index',
  ]);
  for (const banned of ['opaque_token', 'resume_token', 'token', 'email']) {
    assert(!columns.includes(banned), `session INSERT must never persist ${banned}`);
  }
});

Deno.test('lookup by id or token ignores a completed session', () => {
  // Both SELECTs that hydrate a live session must refuse a completed row,
  // otherwise a finished questionnaire can be resumed from a stolen cookie.
  const byId = src.slice(src.indexOf('export async function getSessionById'));
  const byIdWhere = byId.slice(byId.indexOf('WHERE'), byId.indexOf('WHERE') + 80);
  assert(
    byIdWhere.includes('completed_at IS NULL'),
    'getSessionById must ignore completed sessions',
  );

  const byEmail = src.slice(src.indexOf('export async function findActiveSession'));
  const byEmailWhere = byEmail.slice(byEmail.indexOf('WHERE'), byEmail.indexOf('WHERE') + 80);
  assert(
    byEmailWhere.includes('completed_at IS NULL'),
    'findActiveSession must ignore completed sessions',
  );
});

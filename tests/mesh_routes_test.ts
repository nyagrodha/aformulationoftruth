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
  const r3 = await call(
    forgetRoute.POST,
    new Request('http://localhost/api/mesh/forget', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: '{not json',
    }),
  );
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
        const r = await call(
          answers.POST,
          req('/api/mesh/answers', 'POST', { ...ANSWER, question_index: 9, packet_id: 1 }),
        );
        assertEquals(r.status, 422);
      });

      await t.step('the fourth answer from one node is 429', async () => {
        for (const p of [778, 779]) {
          assertEquals(
            (await call(answers.POST, req('/api/mesh/answers', 'POST', { ...ANSWER, packet_id: p }))).status,
            201,
          );
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

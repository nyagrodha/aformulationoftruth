import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './profile.ts';

Deno.env.set('JWT_SECRET', Deno.env.get('JWT_SECRET') || 'profile-create-test-secret');

Deno.test('saving a profile without a session is 401', async () => {
  const req = new Request('http://localhost/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'private' }),
  });
  const res = await handler.POST!(req, {} as never);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Not authenticated');
});

Deno.test('saving a profile with a junk jwt is 401', async () => {
  const req = new Request('http://localhost/api/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'jwt=not-a-token',
    },
    body: JSON.stringify({ visibility: 'private' }),
  });
  const res = await handler.POST!(req, {} as never);
  assertEquals(res.status, 401);
});

Deno.test('saving a profile with a malformed jwt cookie is 401', async () => {
  const req = new Request('http://localhost/api/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'jwt=%',
    },
    body: JSON.stringify({ visibility: 'private' }),
  });
  const res = await handler.POST!(req, {} as never);
  assertEquals(res.status, 401);
});

async function withSession(
  completed: boolean,
  fn: (args: { sessionId: string; emailHash: string; jwt: string }) => Promise<void>,
) {
  const { createQuestionnaireJWT } = await import('../../lib/jwt.ts');
  const { withConnection } = await import('../../lib/db.ts');

  const sessionId = `profile-test-${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 64);
  const emailHash = sessionId.padEnd(64, '0').slice(0, 64);

  await withConnection(async (client) => {
    if (completed) {
      await client.queryObject(
        `INSERT INTO fresh_questionnaire_sessions
           (session_id, email_hash, question_order, completed_at)
         VALUES ($1, $2, '0', NOW())`,
        [sessionId, emailHash],
      );
    } else {
      await client.queryObject(
        `INSERT INTO fresh_questionnaire_sessions
           (session_id, email_hash, question_order)
         VALUES ($1, $2, '0')`,
        [sessionId, emailHash],
      );
    }
  });

  try {
    const jwt = await createQuestionnaireJWT(emailHash, sessionId);
    await fn({ sessionId, emailHash, jwt });
  } finally {
    await withConnection(async (client) => {
      await client.queryObject('DELETE FROM fresh_profiles WHERE email_hash = $1', [emailHash]);
      await client.queryObject(
        'DELETE FROM fresh_questionnaire_sessions WHERE session_id = $1',
        [sessionId],
      );
    });
  }
}

function withCompletedSession(
  fn: (args: { sessionId: string; emailHash: string; jwt: string }) => Promise<void>,
) {
  return withSession(true, fn);
}

function postProfile(jwt: string, body: unknown, raw = false): Promise<Response> {
  return Promise.resolve(
    handler.POST!(
      new Request('http://localhost/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `jwt=${jwt}`,
        },
        body: raw ? (body as string) : JSON.stringify(body),
      }),
      {} as never,
    ),
  );
}

Deno.test({
  name: 'a finished questionnaire can still save a profile',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withCompletedSession(async ({ emailHash, jwt, sessionId }) => {
      const { getSessionById, getSessionRecord } = await import('../../lib/questionnaire-session.ts');
      const { getProfile, getProfileByHandle, listPublicProfiles } = await import('../../lib/profiles.ts');

      assertEquals(await getSessionById(sessionId), null);
      const record = await getSessionRecord(sessionId);
      assertEquals(record?.emailHash, emailHash);

      const handle = `t-${sessionId.replace(/[^a-z0-9]/g, '').slice(-12)}`;
      const res = await postProfile(jwt, {
        visibility: 'public',
        handle,
        displayName: 'weather',
        bio: 'a small room',
      });
      assertEquals(res.status, 200);
      const saved = await getProfile(emailHash);
      assertEquals(saved?.handle, handle);
      assertEquals(saved?.visibility, 'public');
      assertEquals((await getProfileByHandle(handle))?.displayName, 'weather');
      const listed = await listPublicProfiles();
      assertEquals(listed.some((p) => p.handle === handle), true);
    });
  },
});

Deno.test({
  name: 'a public profile without a handle is 400',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withCompletedSession(async ({ jwt }) => {
      const res = await postProfile(jwt, { visibility: 'public' });
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, 'A public profile needs a handle.');
    });
  },
});

Deno.test({
  name: 'a reserved handle is 400',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withCompletedSession(async ({ jwt }) => {
      const res = await postProfile(jwt, { visibility: 'public', handle: 'people' });
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, 'That handle is not available.');
    });
  },
});

Deno.test({
  name: 'invalid JSON is 400 once a session is present',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withCompletedSession(async ({ jwt }) => {
      const res = await postProfile(jwt, '{', true);
      assertEquals(res.status, 400);
    });
  },
});

Deno.test({
  name: 'a taken handle is 409',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    const { withConnection } = await import('../../lib/db.ts');
    const ownerHash = `taken-owner-${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 64);
    const handle = `u-${ownerHash.replace(/[^a-z0-9]/g, '').slice(-12)}`;

    await withConnection(async (client) => {
      await client.queryObject(
        `INSERT INTO fresh_profiles (email_hash, handle, visibility)
         VALUES ($1, $2, 'public')`,
        [ownerHash, handle],
      );
    });

    try {
      await withCompletedSession(async ({ jwt }) => {
        const res = await postProfile(jwt, { visibility: 'public', handle });
        assertEquals(res.status, 409);
        const body = await res.json();
        assertEquals(body.error, 'That handle is already taken.');
      });
    } finally {
      await withConnection(async (client) => {
        await client.queryObject('DELETE FROM fresh_profiles WHERE email_hash = $1', [ownerHash]);
      });
    }
  },
});

Deno.test({
  name: 'an unfinished questionnaire cannot save a profile',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withSession(false, async ({ jwt }) => {
      const res = await postProfile(jwt, { visibility: 'private' });
      assertEquals(res.status, 401);
    });
  },
});

Deno.test({
  name: 'a private profile is not served by handle',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    await withCompletedSession(async ({ emailHash, jwt, sessionId }) => {
      const { getProfile, getProfileByHandle } = await import('../../lib/profiles.ts');
      const handle = `v-${sessionId.replace(/[^a-z0-9]/g, '').slice(-12)}`;
      const res = await postProfile(jwt, {
        visibility: 'private',
        handle,
        displayName: 'hidden',
      });
      assertEquals(res.status, 200);
      assertEquals((await getProfile(emailHash))?.handle, handle);
      assertEquals(await getProfileByHandle(handle), null);
    });
  },
});

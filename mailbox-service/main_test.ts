import { assertEquals, assertMatch } from '@std/assert';
import {
  createApp,
  DEFAULT_TTL_SECONDS,
  MAX_CIPHERTEXT_SIZE,
  MAX_ITEMS_PER_MAILBOX,
  MAX_TTL_SECONDS,
} from './main.ts';
import type { ClaimedMailboxItem, MailboxInsert, MailboxStore } from './db.ts';

interface InMemoryStoredItem extends MailboxInsert {
  pk: number;
  createdAt: Date;
  fetchedAt: Date | null;
}

class InMemoryMailboxStore implements MailboxStore {
  items: InMemoryStoredItem[] = [];
  nextPk = 1;

  countActiveItems(mailboxId: Uint8Array): Promise<number> {
    return Promise.resolve(
      this.items.filter((item) =>
        equalBytes(item.mailboxId, mailboxId) && item.expiresAt > new Date()
      ).length,
    );
  }

  insertItem(input: MailboxInsert): Promise<void> {
    this.items.push({
      ...input,
      pk: this.nextPk++,
      createdAt: new Date(),
      fetchedAt: null,
    });
    return Promise.resolve();
  }

  claimItems(mailboxId: Uint8Array): Promise<ClaimedMailboxItem[]> {
    const claimable = this.items
      .filter((item) =>
        equalBytes(item.mailboxId, mailboxId) &&
        item.expiresAt > new Date() &&
        item.fetchedAt === null
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    for (const item of claimable) {
      item.fetchedAt = new Date();
    }

    return Promise.resolve(
      claimable.map((item) => ({
        pk: item.pk,
        ciphertext: item.ciphertext,
        createdAt: item.createdAt,
      })),
    );
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function randomMailboxId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

Deno.test('POST /api/mailbox/:id stores ciphertext and returns 201', async () => {
  const store = new InMemoryMailboxStore();
  const app = createApp({ store });

  const response = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
    },
    body: new Uint8Array([1, 2, 3, 4, 5]),
  });

  assertEquals(response.status, 201);
  assertEquals(await response.json(), {
    stored: true,
    expiresAt: store.items[0].expiresAt.toISOString(),
  });
  assertEquals(store.items.length, 1);
});

Deno.test('POST /api/mailbox/:id rejects ciphertext over 64KB', async () => {
  const store = new InMemoryMailboxStore();
  const app = createApp({ store });

  const response = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    body: new Uint8Array(MAX_CIPHERTEXT_SIZE + 1),
  });

  assertEquals(response.status, 413);
  assertEquals(store.items.length, 0);
});

Deno.test('POST /api/mailbox/:id rejects invalid mailbox id', async () => {
  const store = new InMemoryMailboxStore();
  const app = createApp({ store });

  const response = await app.request('/api/mailbox/tooshort', {
    method: 'POST',
    body: new Uint8Array([1]),
  });

  assertEquals(response.status, 400);
});

Deno.test('POST /api/mailbox/:id clamps requested ttl to max', async () => {
  const fixedNow = Date.parse('2026-03-12T00:00:00.000Z');
  const store = new InMemoryMailboxStore();
  const app = createApp({
    store,
    now: () => fixedNow,
  });

  const response = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    headers: {
      'x-expires-in': String(MAX_TTL_SECONDS * 10),
    },
    body: new Uint8Array([9]),
  });

  assertEquals(response.status, 201);
  assertEquals(
    store.items[0].expiresAt.toISOString(),
    new Date(fixedNow + MAX_TTL_SECONDS * 1000).toISOString(),
  );
});

Deno.test('POST /api/mailbox/:id uses default ttl when header is absent', async () => {
  const fixedNow = Date.parse('2026-03-12T00:00:00.000Z');
  const store = new InMemoryMailboxStore();
  const app = createApp({
    store,
    now: () => fixedNow,
  });

  const response = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    body: new Uint8Array([7]),
  });

  assertEquals(response.status, 201);
  assertEquals(
    store.items[0].expiresAt.toISOString(),
    new Date(fixedNow + DEFAULT_TTL_SECONDS * 1000).toISOString(),
  );
});

Deno.test('POST /api/mailbox/:id rejects mailbox overflow', async () => {
  const store = new InMemoryMailboxStore();
  const mailboxId = randomMailboxId();
  const mailboxBytes = Uint8Array.from(
    mailboxId.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)),
  );

  for (let index = 0; index < MAX_ITEMS_PER_MAILBOX; index += 1) {
    store.items.push({
      pk: store.nextPk++,
      mailboxId: mailboxBytes,
      ciphertext: new Uint8Array([index]),
      createdAt: new Date(`2026-03-12T00:00:${String(index).padStart(2, '0')}.000Z`),
      expiresAt: new Date('2026-03-19T00:00:00.000Z'),
      fetchedAt: null,
    });
  }

  const app = createApp({ store });
  const response = await app.request(`/api/mailbox/${mailboxId}`, {
    method: 'POST',
    body: new Uint8Array([1]),
  });

  assertEquals(response.status, 409);
  assertMatch(await response.text(), /Mailbox capacity reached/);
});

Deno.test('POST /api/mailbox/:id rate limits repeated requests', async () => {
  const store = new InMemoryMailboxStore();
  let clock = Date.parse('2026-03-12T00:00:00.000Z');
  const app = createApp({
    store,
    now: () => clock,
    getClientKey: () => 'test-client',
  });

  for (let index = 0; index < 10; index += 1) {
    const response = await app.request(`/api/mailbox/${randomMailboxId()}`, {
      method: 'POST',
      body: new Uint8Array([index]),
    });
    assertEquals(response.status, 201);
  }

  const limited = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    body: new Uint8Array([11]),
  });

  assertEquals(limited.status, 429);

  clock += 60_001;
  const recovered = await app.request(`/api/mailbox/${randomMailboxId()}`, {
    method: 'POST',
    body: new Uint8Array([12]),
  });

  assertEquals(recovered.status, 201);
});

Deno.test('GET /api/mailbox/:id claims unread messages and returns base64 payloads', async () => {
  const store = new InMemoryMailboxStore();
  const mailboxId = randomMailboxId();
  const mailboxBytes = Uint8Array.from(
    mailboxId.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)),
  );

  store.items.push({
    pk: store.nextPk++,
    mailboxId: mailboxBytes,
    ciphertext: new Uint8Array([104, 105]),
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    expiresAt: new Date('2026-03-19T00:00:00.000Z'),
    fetchedAt: null,
  });
  store.items.push({
    pk: store.nextPk++,
    mailboxId: mailboxBytes,
    ciphertext: new Uint8Array([1, 2, 3]),
    createdAt: new Date('2026-03-12T00:00:05.000Z'),
    expiresAt: new Date('2026-03-19T00:00:00.000Z'),
    fetchedAt: null,
  });

  const app = createApp({ store });
  const response = await app.request(`/api/mailbox/${mailboxId}`);

  assertEquals(response.status, 200);
  assertEquals(await response.json(), [
    {
      pk: 1,
      ciphertext: 'aGk=',
      created_at: '2026-03-12T00:00:00.000Z',
    },
    {
      pk: 2,
      ciphertext: 'AQID',
      created_at: '2026-03-12T00:00:05.000Z',
    },
  ]);
});

Deno.test('GET /api/mailbox/:id does not return already claimed or expired messages', async () => {
  const store = new InMemoryMailboxStore();
  const mailboxId = randomMailboxId();
  const mailboxBytes = Uint8Array.from(
    mailboxId.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)),
  );

  store.items.push({
    pk: store.nextPk++,
    mailboxId: mailboxBytes,
    ciphertext: new Uint8Array([7]),
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    expiresAt: new Date('2099-03-19T00:00:00.000Z'),
    fetchedAt: null,
  });
  store.items.push({
    pk: store.nextPk++,
    mailboxId: mailboxBytes,
    ciphertext: new Uint8Array([8]),
    createdAt: new Date('2026-03-12T00:00:05.000Z'),
    expiresAt: new Date('2000-03-19T00:00:00.000Z'),
    fetchedAt: null,
  });

  const app = createApp({ store });
  const firstRead = await app.request(`/api/mailbox/${mailboxId}`);
  assertEquals(firstRead.status, 200);
  assertEquals((await firstRead.json()).length, 1);

  const secondRead = await app.request(`/api/mailbox/${mailboxId}`);
  assertEquals(secondRead.status, 200);
  assertEquals(await secondRead.json(), []);
});

Deno.test('GET /api/mailbox/:id rate limits repeated polls', async () => {
  const store = new InMemoryMailboxStore();
  let clock = Date.parse('2026-03-12T00:00:00.000Z');
  const app = createApp({
    store,
    now: () => clock,
    getClientKey: () => 'poller',
  });

  for (let index = 0; index < 30; index += 1) {
    const response = await app.request(`/api/mailbox/${randomMailboxId()}`);
    assertEquals(response.status, 200);
  }

  const limited = await app.request(`/api/mailbox/${randomMailboxId()}`);
  assertEquals(limited.status, 429);

  clock += 60_001;
  const recovered = await app.request(`/api/mailbox/${randomMailboxId()}`);
  assertEquals(recovered.status, 200);
});

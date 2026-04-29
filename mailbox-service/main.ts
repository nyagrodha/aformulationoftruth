import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  hasDatabaseConfig,
  InMemoryMailboxStore,
  type MailboxStore,
  PostgresMailboxStore,
} from './db.ts';

export const MAX_CIPHERTEXT_SIZE = 64 * 1024;
export const MAX_ITEMS_PER_MAILBOX = 50;
export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_TTL_SECONDS = DEFAULT_TTL_SECONDS;
const MAILBOX_ID_HEX_LENGTH = 64;
const POST_RATE_LIMIT = { windowMs: 60_000, maxRequests: 10 };
const GET_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 };

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface AppOptions {
  store: MailboxStore;
  now?: () => number;
  getClientKey?: (request: Request) => string;
}

class MemoryRateLimiter {
  #buckets = new Map<string, RateLimitBucket>();
  #now: () => number;

  constructor(now: () => number) {
    this.#now = now;
  }

  take(key: string, maxRequests: number, windowMs: number): boolean {
    const currentTime = this.#now();
    const existing = this.#buckets.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      this.#buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return true;
    }

    if (existing.count >= maxRequests) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}

function getHeaderValue(headers: Headers, key: string): string | null {
  return headers.get(key) ?? headers.get(key.toLowerCase());
}

function getDefaultClientKey(request: Request): string {
  return getHeaderValue(request.headers, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
}

function isValidMailboxId(mailboxId: string): boolean {
  return mailboxId.length === MAILBOX_ID_HEX_LENGTH && /^[0-9a-f]+$/i.test(mailboxId);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }

  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function resolveTtlSeconds(request: Request): number {
  const rawTtl = getHeaderValue(request.headers, 'x-expires-in');
  if (!rawTtl) {
    return DEFAULT_TTL_SECONDS;
  }

  const parsed = Number.parseInt(rawTtl, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HTTPException(400, { message: 'Invalid expiration header' });
  }

  return Math.min(parsed, MAX_TTL_SECONDS);
}

async function readCiphertext(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = getHeaderValue(request.headers, 'content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_CIPHERTEXT_SIZE) {
      throw new HTTPException(413, { message: 'Ciphertext too large' });
    }
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0) {
    throw new HTTPException(400, { message: 'Ciphertext required' });
  }
  if (body.length > MAX_CIPHERTEXT_SIZE) {
    throw new HTTPException(413, { message: 'Ciphertext too large' });
  }

  return body;
}

export function createApp(options: AppOptions): Hono {
  const now = options.now ?? Date.now;
  const getClientKey = options.getClientKey ?? getDefaultClientKey;
  const rateLimiter = new MemoryRateLimiter(now);
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }

    console.error('[mailbox-service] request failed');
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/mailbox/:id', async (c) => {
    const mailboxId = c.req.param('id');
    if (!isValidMailboxId(mailboxId)) {
      throw new HTTPException(400, { message: 'Invalid mailbox id' });
    }

    const clientKey = getClientKey(c.req.raw);
    if (
      !rateLimiter.take(`get:${clientKey}`, GET_RATE_LIMIT.maxRequests, GET_RATE_LIMIT.windowMs)
    ) {
      throw new HTTPException(429, { message: 'Rate limit exceeded' });
    }

    const claimedItems = await options.store.claimItems(hexToBytes(mailboxId));
    return c.json(
      claimedItems.map((item) => ({
        pk: item.pk,
        ciphertext: bytesToBase64(item.ciphertext),
        created_at: item.createdAt.toISOString(),
      })),
    );
  });

  app.post('/api/mailbox/:id', async (c) => {
    const mailboxId = c.req.param('id');
    if (!isValidMailboxId(mailboxId)) {
      throw new HTTPException(400, { message: 'Invalid mailbox id' });
    }

    const clientKey = getClientKey(c.req.raw);
    if (
      !rateLimiter.take(`post:${clientKey}`, POST_RATE_LIMIT.maxRequests, POST_RATE_LIMIT.windowMs)
    ) {
      throw new HTTPException(429, { message: 'Rate limit exceeded' });
    }

    const ciphertext = await readCiphertext(c.req.raw);
    const ttlSeconds = resolveTtlSeconds(c.req.raw);
    const mailboxBytes = hexToBytes(mailboxId);

    const currentCount = await options.store.countActiveItems(mailboxBytes);
    if (currentCount >= MAX_ITEMS_PER_MAILBOX) {
      throw new HTTPException(409, { message: 'Mailbox capacity reached' });
    }

    const expiresAt = new Date(now() + ttlSeconds * 1000);
    await options.store.insertItem({
      mailboxId: mailboxBytes,
      ciphertext,
      expiresAt,
    });

    return c.json(
      {
        stored: true,
        expiresAt: expiresAt.toISOString(),
      },
      201,
    );
  });

  return app;
}

if (import.meta.main) {
  const useMemoryStore = Deno.env.get('MAILBOX_STORE') === 'memory' || !hasDatabaseConfig();
  const store = useMemoryStore ? new InMemoryMailboxStore() : new PostgresMailboxStore();
  const app = createApp({ store });
  const port = Number.parseInt(Deno.env.get('PORT') ?? '8394', 10);

  if (useMemoryStore) {
    console.warn('[mailbox-service] Starting with in-memory store for local preview only');
  }

  Deno.serve({ port }, app.fetch);
}

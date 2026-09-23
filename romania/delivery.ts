/** Retry-safe delivery orchestration. Receipts contain opaque IDs, never plaintext. */
export interface Bundle {
  sessionId: string;
  keyId?: string;
  deliveryId?: string;
  answers: { questionIndex: number; questionText: string; ciphertext: string; skipped: boolean }[];
  encryptedEmail: string;
  encryptedPassword: string | null;
}

export class DeliveryError extends Error {
  constructor(public readonly stage: string, public readonly status = 503) {
    super(stage);
    this.name = 'DeliveryError';
  }
}

interface Receipt {
  sessionId: string;
  keyId: string;
  state: 'sending' | 'sent';
  at: string;
}

export interface DeliverySteps {
  prepare(bundle: Bundle): Promise<() => Promise<void>>;
  mark(keyId: string, at: Date): Promise<void>;
  confirm(sessionId: string): Promise<void>;
  cleanup(): Promise<void>;
}

export class DeliveryRunner {
  private active = new Set<string>();
  constructor(private receipts: string) {}

  async run(bundle: Bundle, steps: DeliverySteps): Promise<void> {
    const id = bundle.deliveryId;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new DeliveryError('validation', 400);
    const keyId = bundle.keyId || bundle.sessionId;
    if (this.active.has(id)) throw new DeliveryError('busy');
    this.active.add(id);
    const path = `${this.receipts}/${id}.json`;
    try {
      await Deno.mkdir(this.receipts, { recursive: true, mode: 0o700 });
      let receipt: Receipt | null = null;
      try {
        receipt = JSON.parse(await Deno.readTextFile(path));
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw new DeliveryError('receipt');
      }
      if (receipt && (receipt.sessionId !== bundle.sessionId || receipt.keyId !== keyId)) {
        throw new DeliveryError('validation', 409);
      }
      if (receipt && receipt.state !== 'sent') throw new DeliveryError('uncertain', 409);

      if (!receipt) {
        // All pre-SMTP failures are retryable without duplicating mail.
        const send = await steps.prepare(bundle);
        receipt = { sessionId: bundle.sessionId, keyId, state: 'sending', at: new Date().toISOString() };
        await this.save(path, receipt);
        try {
          await send();
        } catch {
          // SMTP may have accepted DATA before the connection broke. Stop and
          // expose an uncertain outcome instead of automatically mailing again.
          throw new DeliveryError('smtp', 409);
        }
        receipt.state = 'sent';
        await this.save(path, receipt);
      }
      try {
        await steps.mark(keyId, new Date(receipt.at));
      } catch {
        throw new DeliveryError('receipt');
      }
      try {
        await steps.confirm(bundle.sessionId);
      } catch {
        // On retry, the sent receipt bypasses rendering and SMTP entirely.
        throw new DeliveryError('callback');
      }
    } finally {
      await steps.cleanup().catch(() => {});
      this.active.delete(id);
    }
  }

  private async save(path: string, receipt: Receipt): Promise<void> {
    const tmp = `${path}.tmp`;
    try {
      const file = await Deno.open(tmp, { create: true, truncate: true, write: true, mode: 0o600 });
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(receipt));
        let offset = 0;
        while (offset < bytes.length) offset += await file.write(bytes.subarray(offset));
        await file.sync();
      } finally {
        file.close();
      }
      await Deno.rename(tmp, path);
      const directory = await Deno.open(this.receipts, { read: true });
      try {
        await directory.sync();
      } finally {
        directory.close();
      }
    } catch {
      throw new DeliveryError('receipt');
    } finally {
      await Deno.remove(tmp).catch(() => {});
    }
  }
}

/** Queue retries expire after 24h; keep receipts for eight days for diagnostics. */
export async function pruneReceipts(dir: string, now = Date.now()): Promise<number> {
  let removed = 0;
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !/^[0-9a-f-]{36}\.json$/.test(entry.name)) continue;
      const path = `${dir}/${entry.name}`;
      const stamp = (await Deno.stat(path)).mtime?.getTime();
      if (stamp !== undefined && stamp < now - 8 * 86400_000) {
        await Deno.remove(path);
        removed++;
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return removed;
}

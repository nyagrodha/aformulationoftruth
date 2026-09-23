import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { type Bundle, DeliveryError, DeliveryRunner, type DeliverySteps } from '../delivery.ts';

const bundle = (): Bundle => ({
  sessionId: 'a'.repeat(64),
  keyId: crypto.randomUUID(),
  deliveryId: crypto.randomUUID(),
  answers: [],
  encryptedEmail: 'ciphertext',
  encryptedPassword: null,
});

Deno.test('callback retry after restart does not decrypt or mail again; key and callback IDs stay distinct', async () => {
  const dir = await Deno.makeTempDir();
  const b = bundle();
  let sends = 0, prepares = 0, confirms = 0;
  const steps: DeliverySteps = {
    prepare: () => {
      prepares++;
      return Promise.resolve(() => {
        sends++;
        return Promise.resolve();
      });
    },
    mark: (id) => {
      assertEquals(id, b.keyId);
      return Promise.resolve();
    },
    confirm: (id) => {
      assertEquals(id, b.sessionId);
      if (++confirms === 1) throw Error('offline');
      return Promise.resolve();
    },
    cleanup: () => Promise.resolve(),
  };
  try {
    await assertRejects(() => new DeliveryRunner(dir).run(b, steps), DeliveryError, 'callback');
    await new DeliveryRunner(dir).run(b, steps);
    assertEquals([prepares, sends, confirms], [1, 1, 2]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('ambiguous SMTP result is held for attention after restart, never auto-resends', async () => {
  const dir = await Deno.makeTempDir();
  const b = bundle();
  let sends = 0;
  const steps: DeliverySteps = {
    prepare: () =>
      Promise.resolve(() => {
        sends++;
        throw Error('DATA response lost');
      }),
    mark: () => Promise.resolve(),
    confirm: () => Promise.resolve(),
    cleanup: () => Promise.resolve(),
  };
  try {
    await assertRejects(() => new DeliveryRunner(dir).run(b, steps), DeliveryError, 'smtp');
    await assertRejects(() => new DeliveryRunner(dir).run(b, steps), DeliveryError, 'uncertain');
    assertEquals(sends, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('preparation failure can be retried without leaving a sending receipt', async () => {
  const dir = await Deno.makeTempDir();
  const b = bundle();
  let prepares = 0, sends = 0;
  const steps: DeliverySteps = {
    prepare: () => {
      if (++prepares === 1) throw new DeliveryError('render');
      return Promise.resolve(() => {
        sends++;
        return Promise.resolve();
      });
    },
    mark: () => Promise.resolve(),
    confirm: () => Promise.resolve(),
    cleanup: () => Promise.resolve(),
  };
  try {
    await assertRejects(() => new DeliveryRunner(dir).run(b, steps), DeliveryError, 'render');
    await new DeliveryRunner(dir).run(b, steps);
    assertEquals(sends, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test('concurrent retry cannot enter SMTP twice', async () => {
  const dir = await Deno.makeTempDir();
  const runner = new DeliveryRunner(dir), b = bundle();
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => entered = resolve);
  const gate = new Promise<void>((resolve) => release = resolve);
  const steps: DeliverySteps = {
    prepare: () =>
      Promise.resolve(async () => {
        entered();
        await gate;
      }),
    mark: () => Promise.resolve(),
    confirm: () => Promise.resolve(),
    cleanup: () => Promise.resolve(),
  };
  const first = runner.run(b, steps);
  try {
    await ready;
    await assertRejects(() => runner.run(b, steps), DeliveryError, 'busy');
  } finally {
    release();
    await first;
    await Deno.remove(dir, { recursive: true });
  }
});

import { processDelivery } from '../lib/delivery-queue.ts';
import { closePool } from '../lib/db.ts';

try {
  // A timer invocation handles a bounded batch; remaining jobs stay durable.
  let processed = 0;
  while (processed < 5 && await processDelivery()) processed++;
  console.log(`[delivery-worker] processed=${processed}`);
} catch {
  console.error('[delivery-worker] failed');
  Deno.exitCode = 1;
} finally {
  await closePool();
}

#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Delete QR daily salts past the retention window. Run from a timer.
 *
 *   deno run -A scripts/prune-qr-salts.ts
 *
 * Once a day's salt is gone, that day's visitor hashes cannot be recomputed
 * by anyone -- including whoever runs this. That unrecoverability is the whole
 * point: it is what makes "unlinkable after 48 hours" a fact about the data
 * rather than a promise about behaviour.
 *
 * WHY A TIMER AND NOT JUST THE REQUEST PATH: recordScan() also prunes, but
 * only while the object is being scanned, and a quiet noticeboard is the
 * normal case rather than the edge case. Observed live on 2026-08-13: an
 * Aug 11 salt was still present because nothing had visited /WillyStCo-op
 * since Aug 11, leaving those two visitors re-linkable past the window.
 *
 * Both mechanisms are kept because they fail independently -- a dead timer is
 * covered by traffic, an idle URL is covered by the timer.
 *
 * Exits non-zero on failure so the timer surfaces it in systemctl status
 * rather than failing silently, which for this job would look identical to
 * success.
 *
 * Spec: docs/superpowers/specs/2026-08-11-coop-qr-scan-counting-design.md
 */

import { closePool } from '../lib/db.ts';
import { pruneSalts, saltCutoffDay } from '../lib/qr-scans.ts';

// Match migrate.ts and the other operator scripts: load env so DATABASE_URL
// is present when this runs from a unit file with a minimal environment.
for (const envFile of ['.env.fresh', '.env']) {
  try {
    for (const line of (await Deno.readTextFile(envFile)).split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const i = t.indexOf('=');
        if (i > 0) Deno.env.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
      }
    }
  } catch { /* file optional */ }
}

const now = new Date();
try {
  const removed = await pruneSalts(now);
  // Counts and a date only -- nothing here identifies anyone.
  console.log(
    `[prune-qr-salts] cutoff=${saltCutoffDay(now)} removed=${removed}`,
  );
} catch (err) {
  console.error(
    `[prune-qr-salts] FAILED: ${err instanceof Error ? err.name : 'error'}`,
  );
  Deno.exit(1);
} finally {
  await closePool();
}

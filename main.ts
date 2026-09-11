/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

/**
 * A rejected promise nobody awaited must not end the process.
 *
 * Deno's default is to exit(1) on an unhandled rejection. denomailer 1.6.0 hit
 * exactly that for days: lib/email.ts caught its own failures correctly while
 * the library leaked a *second* rejection from its socket reader, so every
 * magic-link send took the whole site down — 251 crashes in one day, each one
 * a respondent who submitted the gate and got no link. The mailer is python
 * now, but the class of fault outlives any one library.
 *
 * Registered before anything else so it covers boot as well as serving. Only
 * the rejection's class name is recorded; the value itself can carry an
 * address, a token, or answer text.
 */
globalThis.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  const reason = (event as PromiseRejectionEvent).reason;
  console.error(`[fatal] unhandled rejection suppressed kind=${reason instanceof Error ? reason.name : typeof reason}`);
});

// Load environment variables from .env.fresh (Deno Fresh config)
// Falls back to .env if .env.fresh doesn't exist
const envFiles = ['.env.fresh', '.env'];

/**
 * Strip surrounding quotes and unescape common sequences in .env values.
 * Handles: "quoted", 'quoted', and unquoted values.
 * Unescapes: \" \' \\ \n \r \t
 */
function parseEnvValue(raw: string): string {
  let value = raw;
  // Strip matching outer quotes (single or double)
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // Unescape common escape sequences
  return value
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

for (const envFile of envFiles) {
  try {
    const content = await Deno.readTextFile(envFile);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const rawValue = trimmed.slice(eqIndex + 1).trim();
          const value = parseEnvValue(rawValue);
          Deno.env.set(key, value);
        }
      }
    }
    console.log(`[env] Loaded ${envFile}`);
    break;
  } catch {
    continue;
  }
}

import { start } from '$fresh/server.ts';
import manifest from './fresh.gen.ts';
import config from './fresh.config.ts';
import { isDatabaseConfigured } from './lib/db.ts';
import { increment } from './lib/metrics.ts';

/*
 * An HTTP server should not exit because one request leaked a promise.
 *
 * Deno's default for an unhandled rejection is to end the process, and until
 * now nothing here overrode it. That turned a bug in one dependency into a
 * site-wide outage: denomailer 1.6.0 detached its STARTTLS handshake, the
 * rejection reached no try/catch, and the unit's Restart=always RestartSec=10
 * took every visitor down for ten seconds each time -- 156 times over three
 * days in September 2026, while the questionnaire answers that triggered it
 * had already been written to the database.
 *
 * That dependency is gone (see lib/email.ts), but the property that made it
 * fatal is not, and it applies to every dependency this app has yet to add.
 * A leaked rejection is a bug worth fixing; it is not worth an outage.
 *
 * Deliberately broad. A matcher narrow enough to name one library would have
 * to be widened by whoever hits the next one, and they will hit it in
 * production. The metric is what keeps this from being a silent catch-all:
 * errors.unhandled_rejection appearing in the counters is the signal that
 * something is leaking, and the kind says roughly what.
 *
 * kind only -- never reason.message, which for a mail or database error can
 * carry the address or the row that caused it.
 */
globalThis.addEventListener('unhandledrejection', (event) => {
  const reason = (event as PromiseRejectionEvent).reason;
  const kind = reason instanceof Error && reason.name ? reason.name : 'Unknown';
  increment('errors.unhandled_rejection');
  console.error(`[fatal] unhandled rejection survived kind=${kind}`);
  event.preventDefault();
});

// The connection pool initializes lazily on first query (see getPool in
// lib/db.ts), so there is no explicit init step. Warn at boot if the database
// is not configured; DB-backed routes will error, but the server still starts
// so static and non-DB routes keep working.
if (!isDatabaseConfigured()) {
  console.error('[db] Database not configured; DB-backed routes will fail.');
}

/**
 * Flush the open audience window before exiting.
 *
 * The counter holds its state in memory on purpose (see lib/audience.ts), so a
 * process that dies without this loses whatever it had counted since the last
 * 60s flush. Every restart observed on this host has been a clean `Stopping`,
 * which is precisely the case a signal handler covers.
 *
 * Fresh's start() never returns, so a signal listener is the only hook there is.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  Deno.addSignalListener(signal, async () => {
    try {
      const { shutdownAudience } = await import('./lib/audience.ts');
      await shutdownAudience();
    } catch {
      // Losing one window's count must not stop the process from exiting.
      console.error('[shutdown] audience flush failed');
    }
    Deno.exit(0);
  });
}

await start(manifest, config);

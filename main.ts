/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

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

/**
 * Decide whether a value read from the env file may overwrite a variable that
 * is already present in the real process environment.
 *
 * The real environment wins. In production LOTTO_OPERATOR_TOKEN and its
 * neighbours are supplied by systemd, and a stale .env left in the deploy tree
 * must not be able to quietly put a development secret back in their place.
 * Every other dotenv implementation resolves this the same way, so nobody
 * arriving from Node has to learn a local exception.
 *
 * The cost lands in development: export a variable in your shell and it shadows
 * your edits to the file. Silence is what makes that infuriating to debug, so
 * the loader names the keys it skipped.
 *
 * @param _key     the variable name, e.g. "LOTTO_OPERATOR_TOKEN"
 * @param existing the value already in the process environment, or undefined
 * @returns true to let the file value win, false to keep `existing`
 */
function shouldOverrideExisting(
  _key: string,
  existing: string | undefined,
): boolean {
  return existing === undefined;
}

for (const envFile of envFiles) {
  try {
    const content = await Deno.readTextFile(envFile);
    const skipped: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const rawValue = trimmed.slice(eqIndex + 1).trim();
          const value = parseEnvValue(rawValue);
          if (shouldOverrideExisting(key, Deno.env.get(key))) {
            Deno.env.set(key, value);
          } else {
            skipped.push(key);
          }
        }
      }
    }
    console.log(`[env] Loaded ${envFile}`);
    if (skipped.length > 0) {
      // Key names only, never values: this line goes to the journal.
      console.log(
        `[env] already set in the environment, file values ignored: ${
          skipped.join(', ')
        }`,
      );
    }
    break;
  } catch {
    continue;
  }
}

import { start } from '$fresh/server.ts';
import manifest from './fresh.gen.ts';
import config from './fresh.config.ts';
import { isDatabaseConfigured } from './lib/db.ts';

// The connection pool initializes lazily on first query (see getPool in
// lib/db.ts), so there is no explicit init step. Warn at boot if the database
// is not configured; DB-backed routes will error, but the server still starts
// so static and non-DB routes keep working.
if (!isDatabaseConfigured()) {
  console.error('[db] Database not configured; DB-backed routes will fail.');
}

await start(manifest, config);

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
import { initPool } from './lib/db.ts';

// Initialize database pool with failover (PRIMARY VPN -> LOCAL)
try {
  await initPool();
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.error('[db] Failed to initialize database pool:', errMsg);
  // Continue without database - some routes may still work
}

await start(manifest, config);

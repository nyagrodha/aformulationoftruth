/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

// Load environment variables from .env.fresh (Deno Fresh config)
// Falls back to .env if .env.fresh doesn't exist
const envFiles = ['.env.fresh', '.env'];
for (const envFile of envFiles) {
  try {
    const content = await Deno.readTextFile(envFile);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
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

await start(manifest, config);

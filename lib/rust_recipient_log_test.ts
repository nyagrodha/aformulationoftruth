/**
 * The gate must not log the age recipient on startup.
 *
 * 2fe1e72: the recipient is a public key, but "recipient" is on the banned
 * list and a public key still identifies its holder. The line already tells
 * you the key loaded; the value added nothing.
 *
 *   deno test --allow-read lib/rust_recipient_log_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('../rust-server/src/main.rs', import.meta.url));

Deno.test('startup logs that the age recipient loaded, not which one', () => {
  assert(src.includes('info!("age recipient loaded")'));
  const infoLines = src.split('\n').filter((line) => line.includes('info!(') && line.toLowerCase().includes('recipient'));
  for (const line of infoLines) {
    assertEquals(
      line.includes('recipient_str'),
      false,
      `AGE_RECIPIENT must not reach a log line: ${line.trim()}`,
    );
  }
});

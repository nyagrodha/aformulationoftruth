/**
 * Boot must not die on an unhandled rejection.
 *
 * denomailer 1.6.0 leaked a rejected promise from its socket reader; Deno's
 * default is exit(1), which took the site down 251 times in a day — each one a
 * respondent who submitted the gate and got no link. The mailer is python now,
 * but the class of fault outlives any one library. Pin the listener.
 *
 *   deno test --allow-read lib/unhandled_rejection_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('../main.ts', import.meta.url));

Deno.test('main.ts suppresses unhandled rejections before anything else boots', () => {
  const listener = src.indexOf("addEventListener('unhandledrejection'");
  const envLoad = src.indexOf("envFiles = ['.env.fresh', '.env']");
  const start = src.indexOf('await start(');
  assert(listener >= 0, 'the unhandledrejection listener must exist');
  assert(envLoad >= 0 && start >= 0);
  assert(listener < envLoad, 'the listener must be registered before env files are read');
  assert(listener < start, 'the listener must be registered before Fresh starts');
});

Deno.test('the handler calls preventDefault and logs only a class name', () => {
  const handler = src.slice(src.indexOf("addEventListener('unhandledrejection'"));
  const body = handler.slice(0, handler.indexOf('});') + 3);
  assert(body.includes('event.preventDefault()'), 'without preventDefault, Deno still exits');
  assert(body.includes('reason instanceof Error ? reason.name : typeof reason'));
  assertEquals(body.includes('reason.stack'), false, 'a stack can carry an address or answer text');
  assertEquals(body.includes('${reason}'), false, 'the rejection value itself must never be logged');
});

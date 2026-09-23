/**
 * /proust/index.html -- hermetic: a stand-in `ctx`, no server (see routes/e/[code]_test.ts).
 *
 * The page moved from public/proust/index.html to pages/proust/index.html
 * (task 5c); this pins that the route serves it back out byte for byte, at
 * the same URL, with the same status and content type it had as a static
 * file. public/proust/css/proust.css (referenced by the page) was left in
 * place -- only the HTML moved.
 */
import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './index.html.ts';

Deno.test('GET /proust/index.html returns the page byte for byte', async () => {
  const res = await handler.GET!(new Request('http://localhost/proust/index.html'), {} as never);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type')?.startsWith('text/html'), true);
  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(body, Deno.readFileSync('pages/proust/index.html'));
});

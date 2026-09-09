/**
 * The no-JS landing form posts urlencoded. A validation failure must bounce
 * with a category in the Location, never the address or the answers: those
 * would land in Referer logs, browser history, and the share-card scraper.
 *
 * Distinct from gate-submit_test.ts, which pins encryption / provision-first.
 * This file only exercises the parse-and-bounce path — no gate, no database.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/gate-submit_form_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

function formRequest(fields: Record<string, string>): Request {
  return new Request('http://localhost/api/gate-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

Deno.test({
  name: 'gate-submit form: an invalid email redirects with a category, never the input',
  async fn() {
    const { handler } = await import('./gate-submit.ts');
    const address = 'not-an-email';
    const answer = 'a hammock and no appointments';
    const response = await handler.POST!(
      formRequest({ email: address, answer1: answer, answer2: 'being understood exactly' }),
      {} as never,
    );
    await response.body?.cancel();

    assertEquals(response.status, 303);
    const location = response.headers.get('Location') ?? '';
    assertEquals(location, '/?error=email#begin');
    assert(!location.includes(address), 'redirect must not carry the address');
    assert(!location.includes('@'), 'redirect must not carry an address-shaped token');
    assert(!location.includes(answer), 'redirect must not carry answer text');
  },
});

Deno.test({
  name: 'gate-submit form: a missing email is the same bounce, still with no body in the URL',
  async fn() {
    const { handler } = await import('./gate-submit.ts');
    const response = await handler.POST!(
      formRequest({ answer1: 'one', answer2: 'two' }),
      {} as never,
    );
    await response.body?.cancel();

    assertEquals(response.status, 303);
    assertEquals(response.headers.get('Location'), '/?error=email#begin');
  },
});

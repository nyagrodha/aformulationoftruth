/**
 * The completion page: the copy offer, its outcomes, and the essay.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import CompletionPage, { type CompletionData, COPY_MESSAGES } from '../routes/completion.tsx';

function page(copy?: string): string {
  const props = { data: { resumeToken: 'tok-1', copy } } as unknown as PageProps<CompletionData>;
  return render(<CompletionPage {...props} />);
}

// deliver.ts redirects with /completion?copy=<code>. A code with no message here
// is an outcome the respondent never gets told about — which is exactly how
// every one of them went unshown before this page read the parameter at all.
Deno.test('completion - has a message for exactly the outcomes deliver.ts redirects with', async () => {
  const source = await Deno.readTextFile('routes/api/responses/deliver.ts');
  const sent = [...new Set([...source.matchAll(/'copy=([a-z]+)'/g)].map((m) => m[1]))].sort();
  assert(sent.length > 0, 'found no copy= codes in deliver.ts; has the redirect changed shape?');
  assertEquals(Object.keys(COPY_MESSAGES).sort(), sent);
});

Deno.test('completion - the copy offer comes before the essay', () => {
  const html = page();
  const offer = html.indexOf('action="/api/responses/deliver"');
  const essay = html.indexOf('You are not one self.</h2>');
  assert(offer !== -1, 'the consent form must render');
  assert(essay !== -1, 'the essay must render');
  assert(offer < essay, 'the offer must sit above the essay');
});

Deno.test('completion - a sent copy replaces the form with its confirmation', () => {
  const html = page('sent');
  assertStringIncludes(html, COPY_MESSAGES.sent.text);
  assertEquals(html.includes('action="/api/responses/deliver"'), false, 'no second send');
});

Deno.test('completion - every other outcome keeps the form, so the respondent can try again', () => {
  for (const code of Object.keys(COPY_MESSAGES).filter((c) => c !== 'sent')) {
    const html = page(code);
    assertStringIncludes(html, 'action="/api/responses/deliver"', code);
    assertStringIncludes(html, 'role="status"', code);
  }
});

Deno.test('completion - an unknown outcome shows no message', () => {
  const html = page('bogus');
  assertEquals(html.includes('role="status"'), false);
});

Deno.test('completion - carries the essay from the old completion.html', () => {
  const html = page();
  assertStringIncludes(html, 'Dedicated to the memory and imaginative talent of Richard Brautigan');
  assertStringIncludes(html, '<em>camatkāra</em>');
  assertStringIncludes(html, '<em>pratyabhijñā</em>');
  assertStringIncludes(html, 'the whole point.');
});

Deno.test('completion - no page scripts and no third-party requests', () => {
  const html = page();
  assertEquals(/<script/i.test(html), false, 'no script in the server render');
  for (const host of ['fonts.googleapis', 'fonts.gstatic', 'open-meteo']) {
    assertEquals(html.includes(host), false, host);
  }
});

Deno.test('completion - drawn on the landing layout, with the tip jar in its footer', () => {
  const html = page();
  assertStringIncludes(html, '/css/prolegomenon.css');
  assertEquals(html.includes('/css/main.css'), false);
  assertStringIncludes(html, 'class="folio"');
  assertStringIncludes(html, 'class="tip-jar"');
});

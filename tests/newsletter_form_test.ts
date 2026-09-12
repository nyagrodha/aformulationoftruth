/**
 * The newsletter form works without JavaScript.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { NEWSLETTER_MESSAGES } from '../routes/newsletter.tsx';

Deno.test('newsletter - a message for exactly the statuses subscribe.ts lands on', async () => {
  const source = await Deno.readTextFile('routes/api/newsletter/subscribe.ts');
  const landed = [...new Set([...source.matchAll(/land\('([a-z]+)'\)/g)].map((m) => m[1]))].sort();
  assert(landed.length > 0, 'found no land() calls in subscribe.ts');
  assertEquals(Object.keys(NEWSLETTER_MESSAGES).sort(), landed);
});

Deno.test('newsletter - the contact page form posts itself when script is off', async () => {
  const html = await Deno.readTextFile('public/contact.html');
  const form = html.slice(html.indexOf('<form id="newsletter-form"'));
  const tag = form.slice(0, form.indexOf('>'));
  assertStringIncludes(tag, 'method="post"');
  assertStringIncludes(tag, 'action="/api/newsletter/subscribe"');
  assertStringIncludes(form.slice(0, form.indexOf('</form>')), 'name="email"');
  assertStringIncludes(html, 'id="newsletter"');
});

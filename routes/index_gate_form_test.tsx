/**
 * The landing form is how every questionnaire begins. Two properties have
 * already failed in production:
 *
 *   1. The bounce codes gate-submit redirects with must be the keys
 *      ERROR_MESSAGES actually handles. They drifted; every error but 'server'
 *      came back as a silent blank form.
 *   2. An unknown ?error= value must not be echoed into the page. The handler
 *      looks the code up; anything else is dropped. Reflecting the query
 *      string would turn a bounce URL into an XSS sink.
 *
 * The field names are the same contract on the way in: answer1/answer2/email
 * are what GateSubmitSchema reads, and a renamed textarea would store empty
 * answers while still mailing a link.
 *
 *   deno test --allow-read --allow-env routes/index_gate_form_test.tsx
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { VNode } from 'preact';
import { GATE_QUESTIONS } from '../lib/gate_encrypt.ts';
import { handler } from './index.tsx';

function failRedirectCodes(gateSource: string): string[] {
  const codes = [...gateSource.matchAll(/fail\(\d+, '[^']*', '(\w+)'\)/g)].map((m) => m[1]);
  return [...new Set(codes)].sort();
}

function errorMessageKeys(indexSource: string): string[] {
  const start = indexSource.indexOf('const ERROR_MESSAGES');
  const end = indexSource.indexOf('const DESCRIPTION');
  assert(start >= 0 && end > start, 'ERROR_MESSAGES block not found');
  return [...indexSource.slice(start, end).matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
}

Deno.test('the landing form posts answer1, answer2, and email to /api/gate-submit', async () => {
  const source = await Deno.readTextFile(new URL('./index.tsx', import.meta.url));
  assertStringIncludes(source, "action='/api/gate-submit'");
  assertStringIncludes(source, "method='POST'");
  assertStringIncludes(source, "enctype='application/x-www-form-urlencoded'");
  assertStringIncludes(source, "name='answer1'");
  assertStringIncludes(source, "name='answer2'");
  assertStringIncludes(source, "name='email'");
  assertStringIncludes(source, GATE_QUESTIONS[0]);
  assertStringIncludes(source, GATE_QUESTIONS[1]);
});

Deno.test('gate-submit bounce codes and landing ERROR_MESSAGES are the same set', async () => {
  const gate = await Deno.readTextFile(new URL('./api/gate-submit.ts', import.meta.url));
  const index = await Deno.readTextFile(new URL('./index.tsx', import.meta.url));
  assertEquals(failRedirectCodes(gate), ['email', 'invalid', 'send', 'server']);
  assertEquals(errorMessageKeys(index), ['email', 'invalid', 'send', 'server']);
});

Deno.test('a known bounce code is shown; an unknown one is dropped, not echoed', async () => {
  const captured: Array<{ error?: VNode }> = [];
  const ctx = {
    render(data: { error?: VNode }) {
      captured.push(data);
      return Promise.resolve(new Response('ok'));
    },
  };

  await handler.GET!(new Request('https://example.test/?error=email'), ctx as never);
  assert(captured[0]?.error, 'the email bounce must have a message');
  const emailHtml = render(captured[0].error);
  assertStringIncludes(emailHtml, "isn't valid");
  assertEquals(emailHtml.includes('?error=email'), false);
  assertEquals(emailHtml.includes('<script'), false);

  const hostile = '<img src=x onerror=alert(1)>';
  await handler.GET!(new Request(`https://example.test/?error=${encodeURIComponent(hostile)}`), ctx as never);
  assertEquals(captured[1]?.error, undefined, 'an unknown code must not become a message');
});

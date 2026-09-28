/**
 * The completion form is the other half of consentFrom() in
 * routes/api/responses/deliver.ts. That function accepts only the literal
 * string 'yes'. If this form ever ships value="Yes" or a radio that JS has to
 * check, every "Yes, please" becomes a silent refusal — a mailed copy the
 * respondent asked for, never sent.
 *
 * No JavaScript, on purpose: the answer is which submit button was pressed.
 *
 *   deno test routes/completion_consent_test.tsx
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { ConsentForm } from './completion.tsx';

const CANARY = 'opaque-resume-token-canary';

Deno.test('the consent form posts to the delivery endpoint with no script', () => {
  const html = render(<ConsentForm resumeToken={CANARY} />);
  assertStringIncludes(html, '/api/responses/deliver');
  assertStringIncludes(html, 'method="post"');
  assertEquals(html.includes('<script'), false, 'the form must work with scripting off');
});

Deno.test('Yes, please submits the literal yes that consentFrom accepts', () => {
  const html = render(<ConsentForm resumeToken={CANARY} />);
  assertStringIncludes(html, 'name="consent"');
  assertStringIncludes(html, 'value="yes"');
  assertStringIncludes(html, 'value="no"');
  // A capitalised value would look right and be read as a refusal.
  assertEquals(html.includes('value="Yes"'), false);
  assertEquals(html.includes("value='Yes'"), false);
});

Deno.test('the opaque resume token is a hidden field, not a query parameter', () => {
  const html = render(<ConsentForm resumeToken={CANARY} />);
  assertStringIncludes(html, 'type="hidden"');
  assertStringIncludes(html, 'name="resume_token"');
  assertStringIncludes(html, CANARY);
  assertEquals(html.includes(`action="/api/responses/deliver?`), false);
});

Deno.test('the password field is visible without a radio or a script', () => {
  const html = render(<ConsentForm resumeToken={CANARY} />);
  assert(html.includes('type="password"'), 'an optional password must still be offered');
  assertStringIncludes(html, 'name="password"');
  assertStringIncludes(html, '256');
  assertEquals(html.includes('type="radio"'), false);
});

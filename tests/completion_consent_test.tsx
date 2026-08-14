/**
 * Consent UI on the completion page.
 *
 * The copy here is approved wording, quoted verbatim on purpose: it is the only
 * warning a respondent gets that a forgotten password cannot be reset, and it
 * must not drift through well-meaning edits.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { render } from 'preact-render-to-string';
import { ConsentForm } from '../routes/completion.tsx';

Deno.test('ConsentForm - carries the exact approved copy', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(
    html,
    'Remember this password. No one can reset it. Should you forget it, however, ' +
      'you may request another copy of the pdf be sent to you.',
  );
  assertStringIncludes(html, 'Would you like a copy of your responses e-mailed to you?');
  assertStringIncludes(html, '>Yes, please<');
  assertStringIncludes(html, '>No, thanks<');
  assertStringIncludes(html, 'placeholder="optional password"');
});

Deno.test('ConsentForm - works without JavaScript', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(html, 'method="post"');
  assertStringIncludes(html, 'action="/api/responses/deliver"');
  assert(!html.includes('onclick'), 'no inline JS handlers');
  assert(!/\son[a-z]+=/i.test(html), 'no inline event-handler attributes of any kind');
});

Deno.test('ConsentForm - password field is optional and not autofilled', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  const pw = html.slice(html.indexOf('type="password"'));
  const pwTag = pw.slice(0, pw.indexOf('>'));
  assert(!pwTag.includes('required'), 'password must be optional');
  assertStringIncludes(html, 'autocomplete="new-password"');
  assertStringIncludes(html, 'maxlength="256"');
});

// The answer rides on WHICH submit button is pressed. A browser sends only the
// pressed button's name/value, so two submit buttons sharing name="consent"
// carry the choice with no script anywhere. Radios would need a CSS or JS
// reveal for the password panel; buttons need neither.
Deno.test('ConsentForm - two submit buttons named consent carry the answer', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);

  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assertEquals(buttons.length, 2, 'exactly two buttons');

  for (const button of buttons) {
    assertStringIncludes(button, 'type="submit"');
    assertStringIncludes(button, 'name="consent"');
  }

  // consentFrom() in routes/api/responses/deliver.ts accepts ONLY the literal
  // lowercase 'yes'; anything else -- including 'Yes' -- is read as a refusal.
  const yes = buttons.find((b) => b.includes('value="yes"'));
  const no = buttons.find((b) => b.includes('value="no"'));
  assert(yes, 'a button must submit consent=yes, exactly lowercase');
  assert(no, 'a button must submit consent=no');

  assertStringIncludes(html, `${yes}Yes, please</button>`);
  assertStringIncludes(html, `${no}No, thanks</button>`);
});

// The radios are gone for good. `.consent-yes:checked ~ .pw-panel` cannot work
// without one, so a radio reappearing here means the password panel reveal was
// half-restored -- and the panel would be hidden with nothing able to show it.
Deno.test('ConsentForm - no radio inputs remain', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assert(!html.includes('type="radio"'), 'no radio inputs');
  assert(!html.includes('consent-yes'), 'no leftover radio hook for the old CSS reveal');
});

// With no radio to check, nothing can reveal a hidden panel without script.
// The field must therefore render unconditionally, and it must precede the
// buttons so a password is typed before the choice is submitted.
Deno.test('ConsentForm - password field is always visible, above the buttons', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);

  const pw = html.indexOf('type="password"');
  const firstButton = html.indexOf('<button');
  assert(pw !== -1, 'the password field must render unconditionally');
  assert(firstButton !== -1 && pw < firstButton, 'the password field must come before the buttons');

  // Nothing in the markup may hide it: no hidden attribute, no inline display:none.
  const pwTag = html.slice(pw, html.indexOf('>', pw));
  assert(!pwTag.includes('hidden'), 'the password field must not be hidden');
  assert(!/display\s*:\s*none/.test(html), 'nothing in the form may be hidden inline');
});

Deno.test('ConsentForm - carries the resume token so delivery knows the session', () => {
  const html = render(<ConsentForm resumeToken='tok-abc' />);
  assertStringIncludes(html, 'type="hidden"');
  assertStringIncludes(html, 'name="resume_token"');
  assertStringIncludes(html, 'value="tok-abc"');
});

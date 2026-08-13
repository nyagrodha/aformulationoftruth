/**
 * Consent UI on the completion page.
 *
 * The copy here is approved wording, quoted verbatim on purpose: it is the only
 * warning a respondent gets that a forgotten password cannot be reset, and it
 * must not drift through well-meaning edits.
 *
 * Run with: deno task test
 */

import { assert, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
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
  assertStringIncludes(html, 'Yes, please');
  assertStringIncludes(html, 'Send me a .pdf email');
  assertStringIncludes(html, 'placeholder="optional password"');
});

Deno.test('ConsentForm - works without JavaScript', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(html, 'method="post"');
  assertStringIncludes(html, 'action="/api/responses/deliver"');
  assert(!html.includes('onclick'), 'no inline JS handlers');
});

// Scoped to the password input: the radios legitimately carry `required`, so
// asserting across the whole form would be a guaranteed failure.
Deno.test('ConsentForm - password field is optional and not autofilled', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  const pw = html.slice(html.indexOf('type="password"'));
  const pwTag = pw.slice(0, pw.indexOf('>'));
  assert(!pwTag.includes('required'), 'password must be optional');
  assertStringIncludes(html, 'autocomplete="new-password"');
});

// The CSS reveal is `.consent-yes:checked ~ .pw-panel`, a sibling combinator --
// siblings must share a parent. If the radio is ever nested back inside its
// label, its only sibling becomes the label text and the panel can never be
// revealed: on the no-JS path the password field would silently not exist.
// This asserts the structural property the stylesheet depends on.
Deno.test('ConsentForm - radio is a sibling of the password panel, not nested in a label', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);

  const radio = html.indexOf('id="consent-yes"');
  const panel = html.indexOf('pw-panel');
  assert(radio !== -1 && panel !== -1, 'both the radio and the panel must render');
  assert(radio < panel, 'the radio must precede the panel for ~ to match');

  // No <label ...> may open between the radio and the panel and remain unclosed.
  const between = html.slice(radio, panel);
  const opened = (between.match(/<label/g) || []).length;
  const closed = (between.match(/<\/label>/g) || []).length;
  assert(opened === closed, 'the radio must not sit inside an unclosed label');
});

Deno.test('ConsentForm - carries the resume token so delivery knows the session', () => {
  const html = render(<ConsentForm resumeToken='tok-abc' />);
  assertStringIncludes(html, 'name="resume_token"');
  assertStringIncludes(html, 'value="tok-abc"');
});

Deno.test('ConsentForm - offers a No option', () => {
  const html = render(<ConsentForm resumeToken='tok-1' />);
  assertStringIncludes(html, 'value="no"');
  assertStringIncludes(html, '>No<');
});

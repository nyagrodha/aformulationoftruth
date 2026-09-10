/**
 * Email validation and Gmail normalisation.
 *
 * This is the gate in front of magic-link and newsletter: a miss here is
 * either an address that cannot be mailed, a plus-alias that duplicates a
 * respondent, or a scattered-dot Gmail that was meant to be rejected.
 *
 *   deno test lib/emailValidator_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { isSuspiciousGmailParts, normalizeEmailParts, validateEmail } from './emailValidator.ts';

Deno.test('validateEmail accepts a well-formed address and lowercases it', () => {
  assertEquals(validateEmail('  Alex@Example.COM  '), {
    valid: true,
    normalized: 'alex@example.com',
  });
});

Deno.test('validateEmail rejects an empty local, a missing domain, and a second @', () => {
  for (const email of ['', '@x.com', 'x@', 'a@b@c.com', 'not-an-email', 'missing@domain']) {
    assertEquals(validateEmail(email).valid, false, `should reject ${email}`);
  }
});

Deno.test('validateEmail rejects spaces and HTML metacharacters', () => {
  assertEquals(validateEmail('spaces in@email.com').valid, false);
  assertEquals(validateEmail('a<script>@x.com').valid, false);
  assertEquals(validateEmail('a>b@x.com').valid, false);
});

Deno.test('Gmail dots and plus-aliases collapse to one mailbox', () => {
  assertEquals(validateEmail('al.ex+tag@gmail.com'), { valid: true, normalized: 'alex@gmail.com' });
  assertEquals(validateEmail('alex@googlemail.com'), { valid: true, normalized: 'alex@gmail.com' });
});

Deno.test('non-Gmail dots and plus signs are left alone', () => {
  assertEquals(validateEmail('al.ex+tag@example.com'), {
    valid: true,
    normalized: 'al.ex+tag@example.com',
  });
});

Deno.test('scattered-dot Gmail locals are suspicious, other domains are not', () => {
  // Many tiny segments: a known throwaway/obfuscation pattern.
  assertEquals(isSuspiciousGmailParts('a.b.c.d.e', 'gmail.com'), true);
  assertEquals(isSuspiciousGmailParts('a.b.c.d.e', 'example.com'), false);
  assertEquals(validateEmail('a.b.c.d.e@gmail.com'), {
    valid: false,
    reason: 'suspicious_pattern',
  });
});

Deno.test('a normal Gmail with a couple of dots is not suspicious', () => {
  assertEquals(validateEmail('first.last@gmail.com'), {
    valid: true,
    normalized: 'firstlast@gmail.com',
  });
});

Deno.test('normalizeEmailParts canonicalises googlemail.com', () => {
  assertEquals(normalizeEmailParts('alex', 'googlemail.com'), 'alex@gmail.com');
});

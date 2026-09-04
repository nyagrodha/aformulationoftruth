import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import PrivacyPage from './privacy.tsx';

Deno.test('privacy page preserves its original copy', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'We believe citizens of a free society must be able to choose privacy');
  assertStringIncludes(html, 'Your data belongs to you');
  assertStringIncludes(html, 'Abhinavagupta');
});

/*
 * The page used to claim answers stayed in localStorage and never reached the
 * server. They do reach it, and are age-encrypted there. Asserting the
 * correction explicitly so a future revert of the copy is caught here rather
 * than by someone reading a privacy policy that misdescribes the system.
 */
Deno.test('privacy page describes where answers actually go', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'are sent to our server');
  assertStringIncludes(html, 'age-encrypted on arrival');
  assertStringIncludes(html, 'fails closed');
});

Deno.test('privacy page no longer claims browser-only storage', () => {
  const html = render(<PrivacyPage />);
  assertEquals(html.includes('localStorage'), false);
  assertEquals(html.includes('never receive'), false);
});

Deno.test('the static privacy.html is gone', async () => {
  let existed = true;
  try {
    await Deno.stat('./public/privacy.html');
  } catch {
    existed = false;
  }
  assertEquals(existed, false);
});

/*
 * The page used to say the access logs hold "IP addresses (automatically
 * rotated and deleted after 7 days)". That was false in the visitor's favour
 * but false all the same: Caddy discards the address before the line is
 * written, so there was never a 7-day retention to speak of.
 *
 * It matters more now that the server counts visitors, because the honest
 * description of that counting is the part a future edit is most likely to
 * quietly drop. Pinning it here means the page cannot drift back into
 * describing a system that does not exist.
 */
Deno.test('privacy page no longer claims IP addresses are retained', () => {
  const html = render(<PrivacyPage />);
  assertEquals(html.includes('deleted after 7 days'), false);
  assertStringIncludes(html, 'Not IP addresses');
  assertStringIncludes(html, 'discards the address before the');
});

Deno.test('privacy page describes the visitor count honestly', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'count how many people visit, and nothing else');
  assertStringIncludes(html, 'We do not track');
});

/*
 * These two promises are the reason the design stores no per-visitor record.
 * If a future change starts keeping one, this test should be the thing that
 * fails -- deleting it is then a deliberate act rather than an oversight.
 */
Deno.test('privacy page still promises no fingerprinting or profiling', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'No fingerprinting');
  assertStringIncludes(html, 'No behavioral profiling');
});

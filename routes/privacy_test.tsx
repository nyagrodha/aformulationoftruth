import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import PrivacyPage from './privacy.tsx';

Deno.test('privacy page preserves its original copy', () => {
  const html = render(<PrivacyPage />);
  assertStringIncludes(html, 'We believe in radical privacy');
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

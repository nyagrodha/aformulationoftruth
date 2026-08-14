/**
 * The resume notice on the questionnaire page.
 *
 * The thirty days is a promise to a person mid-questionnaire, and three
 * mechanisms have to agree with it: romania/keystore.ts expires session
 * identities thirty days from last activity, cleanupExpiredSessions deletes
 * sessions on the same basis, and this copy says so. These tests pin the copy;
 * the keystore tests pin the clock.
 */

import { assert, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const page = await Deno.readTextFile(new URL('../routes/questionnaire.tsx', import.meta.url));

/**
 * Just the notice element, not the whole file.
 *
 * The first version of this scanned the entire source and failed on the word
 * "destroyed" -- which appears in the COMMENT explaining why the copy avoids
 * it. A test that reads comments is testing the wrong artifact: what reaches a
 * respondent is the rendered element.
 */
const notice = (() => {
  const start = page.indexOf("<p class='resume-hint'>");
  const end = page.indexOf('</p>', start);
  if (start === -1 || end === -1) throw new Error('resume notice not found in the page');
  return page.slice(start, end);
})();

Deno.test('resume notice - promises thirty days from the LAST visit, not the first', () => {
  assertStringIncludes(notice, 'thirty days from your last visit');
  assertStringIncludes(notice, 'returning');
});

Deno.test('resume notice - points at the webmaster with a working mailto', () => {
  assertStringIncludes(notice, 'mailto:formitselfisemptiness@aformulationoftruth.com');
  assertStringIncludes(notice, '>webmaster</a>');
});

// The answers survive via break-glass; only the ability to RESUME is lost.
// Saying the work is destroyed would be false and would stop people writing in.
Deno.test('resume notice - does not claim the answers are destroyed', () => {
  for (const forbidden of ['deleted forever', 'permanently lost', 'destroyed', 'gone forever']) {
    assert(!notice.includes(forbidden), `notice must not claim: ${forbidden}`);
  }
});

Deno.test('resume notice - needs no JavaScript', () => {
  assert(!/on[a-z]+=/.test(notice), 'no inline event handlers');
});

// If the cleanup ever measures from creation again, a respondent still working
// loses their session while the page promises otherwise.
Deno.test('session cleanup - expires from last activity, matching the promise', async () => {
  const lib = await Deno.readTextFile(new URL('../lib/questionnaire-session.ts', import.meta.url));
  assertStringIncludes(lib, "updated_at < NOW() - INTERVAL '30 days'");
  assert(!lib.includes("created_at < NOW() - INTERVAL '30 days'"), 'must not expire from creation');
});

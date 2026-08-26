import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import MessengerPage from './messenger.tsx';
import AliasPage from './encrypted-messenger.tsx';

Deno.test('messenger page renders both halves of the seal/open flow', () => {
  const html = render(<MessengerPage />);
  assertStringIncludes(html, 'encrypted messenger');
  assertStringIncludes(html, 'seal a message');
  assertStringIncludes(html, 'open a message');
});

/*
 * The crypto lives entirely in this script and the page is inert without it:
 * every button is wired up from there, so a rename under public/ breaks the
 * page silently. Nothing server-side would fail — the buttons would simply
 * stop doing anything, with no error for anyone to notice.
 */
Deno.test('messenger page loads the script that implements its crypto', () => {
  const html = render(<MessengerPage />);
  assertStringIncludes(html, '/js/messenger.js');
});

/*
 * encrypted-messenger.tsx is a re-export, not a second copy. Asserting
 * identity rather than matching output so that an edit which forks it into a
 * divergent implementation is caught here, while the two still render alike.
 */
Deno.test('the /encrypted-messenger alias is the same component', () => {
  assertEquals(AliasPage, MessengerPage);
});

/*
 * The page claims "no server plaintext" in its own eyebrow copy. That claim is
 * only true while the script has no way to transmit anything, so pin it here
 * rather than trust the sentence: a future fetch() added for autosave or
 * telemetry would quietly turn the copy into a lie about a crypto tool.
 *
 * Modelled on privacy_test.tsx, which asserts the privacy page's corrections
 * for the same reason — a policy that misdescribes the system is worse than no
 * policy at all.
 */
Deno.test('messenger script cannot transmit: plaintext never leaves the browser', async () => {
  const source = await Deno.readTextFile(new URL('../public/js/messenger.js', import.meta.url));
  for (const sink of ['fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'WebSocket', 'EventSource']) {
    assertEquals(source.includes(sink), false, `messenger.js must not reach the network, found: ${sink}`);
  }
});

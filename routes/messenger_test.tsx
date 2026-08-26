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

/*
 * messenger.js calls document.getElementById at module scope, so it cannot be
 * imported here. The two guards are pure though, so lift them out of the source
 * and exercise them for real rather than asserting the file merely mentions a
 * constant. The slice is bounded by the first function that touches WebCrypto,
 * so reordering the file fails this loudly instead of silently testing nothing.
 */
function loadGuards() {
  const src = Deno.readTextFileSync(new URL('../public/js/messenger.js', import.meta.url));
  const start = src.indexOf('const DEFAULT_ITERATIONS');
  const end = src.indexOf('async function keyFromPassphrase');
  if (start < 0 || end < 0 || end <= start) throw new Error('guards not found in messenger.js');
  return new Function(
    `${src.slice(start, end)}; return { checkedIterations, checkedPassphrase };`,
  )() as {
    checkedIterations: (v: unknown) => number;
    checkedPassphrase: (v: unknown) => string;
  };
}

/*
 * The envelope is pasted in from wherever the message travelled, so iterations
 * is attacker-controlled. deriveKey runs PBKDF2 on the main thread: 1e12 would
 * freeze the tab outright, with no error and nothing to cancel.
 */
Deno.test('a hostile iteration count is refused rather than run', () => {
  const { checkedIterations } = loadGuards();
  for (const hostile of [1e12, 1_000_001, 0, -1, 1.5, NaN, Infinity, '250000', true, {}]) {
    let threw = false;
    try {
      checkedIterations(hostile);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, `iterations ${hostile} should be refused`);
  }
});

/* Absent stays 250000: v1 envelopes omit the field entirely. */
Deno.test('a legitimate iteration count still opens', () => {
  const { checkedIterations } = loadGuards();
  assertEquals(checkedIterations(undefined), 250000);
  assertEquals(checkedIterations(null), 250000);
  assertEquals(checkedIterations(250000), 250000);
  assertEquals(checkedIterations(1_000_000), 1_000_000);
});

/*
 * An empty passphrase derives a key anyone can rederive while the envelope
 * still looks sealed — the exact failure the page's promise rules out.
 */
Deno.test('an empty passphrase is refused before anything is sealed', () => {
  const { checkedPassphrase } = loadGuards();
  for (const empty of ['', '   ', '\t\n', undefined, null]) {
    let threw = false;
    try {
      checkedPassphrase(empty);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, `passphrase ${JSON.stringify(empty)} should be refused`);
  }
});

/*
 * Validated on the trimmed value, derived from the raw one. Trimming before
 * derivation would change the key, so a passphrase with deliberate padding
 * would seal envelopes it could never reopen.
 */
Deno.test('a padded passphrase is passed through untouched', () => {
  const { checkedPassphrase } = loadGuards();
  assertEquals(checkedPassphrase(' pad '), ' pad ');
  assertEquals(checkedPassphrase('secret'), 'secret');
});

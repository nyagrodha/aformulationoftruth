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
  const start = src.indexOf('const b64 =');
  const end = src.indexOf("document.getElementById('encrypt')");
  if (start < 0 || end < 0 || end <= start) throw new Error('guards not found in messenger.js');
  /*
   * enc/dec are declared above the slice, alongside the getElementById calls
   * that make the module unimportable, so restate them rather than widening the
   * slice to include the DOM.
   */
  return new Function(
    'const enc = new TextEncoder(); const dec = new TextDecoder();' +
      `${src.slice(start, end)}
       return { checkedIterations, checkedPassphrase, decodeField, b64, keyFromPassphrase, DEFAULT_ITERATIONS };`,
  )() as {
    checkedIterations: (v: unknown) => number;
    checkedPassphrase: (v: unknown) => string;
    decodeField: (name: string, text: unknown, maxBytes: number) => Uint8Array<ArrayBuffer>;
    b64: (b: ArrayBuffer | Uint8Array<ArrayBuffer>) => string;
    keyFromPassphrase: (p: string, salt: Uint8Array<ArrayBuffer>, i: number) => Promise<CryptoKey>;
    DEFAULT_ITERATIONS: number;
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

/*
 * unb64 allocates before anything inspects the input, so every envelope field
 * was decoded at whatever size it arrived. The bound is checked against the
 * base64 string length, before atob, because checking afterwards has already
 * performed the allocation it was meant to prevent.
 */
Deno.test('an oversized envelope field is refused before it is decoded', () => {
  const { decodeField } = loadGuards();
  const huge = 'A'.repeat(4 * 4096); // ~12 KiB decoded
  let threw = false;
  try {
    decodeField('salt', huge, 64);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, 'an oversized salt should be refused');
});

Deno.test('a missing envelope field is named in the error', () => {
  const { decodeField } = loadGuards();
  for (const missing of [undefined, null, '', 42]) {
    let message = '';
    try {
      decodeField('iv', missing, 16);
    } catch (err) {
      message = (err as Error).message;
    }
    assertStringIncludes(message, 'iv');
  }
});

/*
 * Bounded by maximum, not pinned to the 16 and 12 this page writes: the format
 * is published on the page as a spec, so a 32-byte salt from another
 * implementation is legitimate and must still open.
 */
Deno.test('a legitimately sized field still decodes, including a larger salt', () => {
  const { decodeField } = loadGuards();
  const b64of = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n)));
  assertEquals(decodeField('salt', b64of(16), 64).length, 16);
  assertEquals(decodeField('salt', b64of(32), 64).length, 32);
  assertEquals(decodeField('iv', b64of(12), 16).length, 12);
});

/*
 * The guards sit directly in the seal and open paths, so the thing actually
 * worth proving is that an envelope this page produces still opens after them.
 * Deno has WebCrypto, so this runs the real PBKDF2 and AES-GCM rather than
 * standing in for it.
 */
Deno.test('an envelope sealed by this page opens again', async () => {
  const m = loadGuards();
  const encoder = new TextEncoder();
  const plaintext = 'the passphrase never leaves this page — ünïcode';
  const pass = ' padded secret ';

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await m.keyFromPassphrase(m.checkedPassphrase(pass), salt, m.DEFAULT_ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const envelope = { iterations: m.DEFAULT_ITERATIONS, salt: m.b64(salt), iv: m.b64(iv), data: m.b64(data) };

  const reopened = await m.keyFromPassphrase(
    m.checkedPassphrase(pass),
    m.decodeField('salt', envelope.salt, 64),
    m.checkedIterations(envelope.iterations),
  );
  const out = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: m.decodeField('iv', envelope.iv, 16) },
    reopened,
    m.decodeField('data', envelope.data, 1048576),
  );
  assertEquals(new TextDecoder().decode(out), plaintext);

  /* A v1 envelope predates the iterations field; it must still open at 250000. */
  const legacy = await m.keyFromPassphrase(
    pass,
    m.decodeField('salt', envelope.salt, 64),
    m.checkedIterations(undefined),
  );
  const legacyOut = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: m.decodeField('iv', envelope.iv, 16) },
    legacy,
    m.decodeField('data', envelope.data, 1048576),
  );
  assertEquals(new TextDecoder().decode(legacyOut), plaintext);
});

Deno.test('the wrong passphrase does not open an envelope', async () => {
  const m = loadGuards();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await m.keyFromPassphrase('right', salt, m.DEFAULT_ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('secret'));

  const wrong = await m.keyFromPassphrase('wrong', salt, m.DEFAULT_ITERATIONS);
  let threw = false;
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrong, data);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, 'AES-GCM must reject a key derived from the wrong passphrase');
});

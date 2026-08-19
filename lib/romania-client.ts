/**
 * Handing a delivery bundle to the key box.
 *
 * The bundle is ciphertext this process cannot read: answers encrypted to the
 * session key plus break-glass, the address the same, and the password if one
 * was given. Only the key box holds the identity that opens any of it.
 *
 * Pushing the whole bundle -- rather than notifying the key box and letting it
 * query the database -- is what keeps the split real. The key box never holds
 * database credentials, so compromising it yields the keys and whatever is in
 * flight, but not the corpus.
 */

const KEYBOX_URL = Deno.env.get('KEYBOX_RENDER_URL') || '';
const KEYBOX_TOKEN = Deno.env.get('KEYBOX_RENDER_TOKEN') || '';
const PUSH_TIMEOUT_MS = 20_000;

export interface BundleAnswer {
  questionIndex: number;
  questionText: string;
  /** age-armored. Empty for a question the respondent never reached. */
  ciphertext: string;
  skipped: boolean;
}

export interface DeliveryBundle {
  sessionId: string;
  answers: BundleAnswer[];
  encryptedEmail: string;
  /** age-armored, or null when no password was chosen. */
  encryptedPassword: string | null;
}

/** Raised when the key box could not be handed the bundle. */
export class KeyboxUnavailableError extends Error {
  constructor() {
    // Contentless by design: the bundle and the session id must not reach a log.
    super('key box unavailable');
    this.name = 'KeyboxUnavailableError';
  }
}

export function keyboxConfigured(): boolean {
  return Boolean(KEYBOX_URL && KEYBOX_TOKEN);
}

/**
 * Hand the bundle to the key box for rendering and delivery.
 *
 * Throws KeyboxUnavailableError on any failure. The caller decides what that
 * means: at consent time it means "queue it and tell the respondent it is on
 * its way", never "lose it silently".
 */
export async function pushBundle(bundle: DeliveryBundle): Promise<void> {
  if (!keyboxConfigured()) throw new KeyboxUnavailableError();

  let res: Response;
  try {
    res = await fetch(`${KEYBOX_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEYBOX_TOKEN}`,
      },
      body: JSON.stringify(bundle),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
  } catch {
    // Network failure or timeout. Nothing logged: the request body is the
    // respondent's whole questionnaire, even if encrypted.
    throw new KeyboxUnavailableError();
  }

  // Drain rather than read: the body could echo what we sent.
  await res.body?.cancel();
  if (!res.ok) throw new KeyboxUnavailableError();
}

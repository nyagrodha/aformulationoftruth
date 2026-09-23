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
const PUSH_TIMEOUT_MS = 300_000;

export interface BundleAnswer {
  questionIndex: number;
  questionText: string;
  /** age-armored. Empty for a question the respondent never reached. */
  ciphertext: string;
  skipped: boolean;
}

export interface DeliveryBundle {
  sessionId: string;
  /** The gate token names the private key; sessionId names the callback row. */
  keyId?: string;
  deliveryId?: string;
  answers: BundleAnswer[];
  encryptedEmail: string;
  /** age-armored, or null when no password was chosen. */
  encryptedPassword: string | null;
}

/** Raised when the key box could not be handed the bundle. */
export class KeyboxUnavailableError extends Error {
  constructor(public readonly stage = 'transport', public readonly permanent = false) {
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

  const stages = ['identity', 'decrypt', 'render', 'protect', 'smtp', 'uncertain', 'receipt', 'callback', 'validation'];
  const reported = res.headers.get('X-Delivery-Stage') || '';
  const stage = stages.includes(reported) ? reported : 'transport';
  await res.body?.cancel();
  if (!res.ok) throw new KeyboxUnavailableError(stage, [400, 409, 410, 422].includes(res.status));
}

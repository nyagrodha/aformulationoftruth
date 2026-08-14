/**
 * Sending the finished document.
 *
 * The key box sends this, not the web tier, because only the key box can
 * decrypt the address. Handing it back to Iceland to post would mean handing
 * over the plaintext address AND the plaintext PDF -- exactly what the split
 * exists to prevent.
 *
 * Verified against denomailer 1.6.0: attachments accept
 * { encoding: 'binary', content: Uint8Array }, so the PDF goes as bytes rather
 * than being base64'd by hand.
 */

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export interface DeliveryMail {
  to: string;
  /** The rendered document. Protected already, if a password was supplied. */
  pdf: Uint8Array;
  filename: string;
  /** Present only when the PDF is password-protected. */
  protected: boolean;
  /** Link that re-issues a copy; omitted when re-send is unavailable. */
  resendUrl?: string;
}

function body(mail: DeliveryMail): string {
  const lines = [
    'Attached is a copy of the responses you wrote.',
    '',
  ];
  if (mail.protected) {
    lines.push(
      'The document is encrypted with the password you chose. We do not have it',
      'and cannot reset it.',
      '',
    );
  }
  if (mail.resendUrl) {
    lines.push(
      'If the password does not work, you can request a fresh copy — with a new',
      'password — using the link below. It expires in seven days.',
      '',
      mail.resendUrl,
      '',
    );
  }
  lines.push('aformulationoftruth.com');
  return lines.join('\n');
}

/**
 * Mail the document. Throws on any failure; the caller decides whether to
 * retry, and must not record a delivery that did not happen.
 */
export async function sendDelivery(mail: DeliveryMail): Promise<void> {
  const hostname = Deno.env.get('SMTP_HOST');
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587', 10);
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true';
  const username = Deno.env.get('SMTP_USER');
  const password = Deno.env.get('SMTP_PASS');
  const fromEmail = Deno.env.get('FROM_EMAIL') || username;
  const fromName = Deno.env.get('SMTP_FROM_NAME') || 'a formulation of truth';

  if (!hostname || !username || !password || !fromEmail) {
    throw new Error('SMTP not configured');
  }

  const client = new SMTPClient({
    connection: { hostname, port, tls: implicitTls, auth: { username, password } },
  });

  try {
    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: mail.to,
      subject: 'your responses',
      content: body(mail),
      attachments: [{
        encoding: 'binary',
        content: mail.pdf,
        filename: mail.filename,
        contentType: 'application/pdf',
      }],
    });
  } finally {
    // Always close: a leaked connection holds an authenticated session open
    // against the provider's per-account limit. close() is typed
    // `void | Promise<void>` in denomailer 1.6.0, so it is wrapped rather than
    // .catch()'d -- the latter does not typecheck against the void arm.
    try {
      await client.close();
    } catch {
      // Nothing useful to do; the message is already sent or already failed.
    }
  }
}

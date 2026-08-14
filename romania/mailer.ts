/**
 * Sending the finished document.
 *
 * The key box sends this, not the web tier, because only the key box can
 * decrypt the address. Handing it back to the web tier to post would mean
 * handing over the plaintext address AND the plaintext PDF -- exactly what the
 * split exists to prevent.
 *
 * Delegates to send_mail.py. denomailer 1.6.0 fails this submission ("invalid
 * cmd", then "Bad resource ID") on a socket where Python smtplib completes
 * STARTTLS and authenticates without complaint; the service already shells out
 * to typst and qpdf, so this is consistent rather than exotic.
 *
 * The spec file is 0600 and its path is the ONLY argument. The address, the
 * body and the document never touch argv, which is world-readable via
 * /proc/<pid>/cmdline.
 */

export interface DeliveryMail {
  to: string;
  /** Already protected, if a password was supplied. */
  pdf: Uint8Array;
  filename: string;
  protected: boolean;
  resendUrl?: string;
  /** tmpfs directory; the spec file is written and removed here. */
  workDir: string;
}

function body(mail: DeliveryMail): string {
  const lines = ['Attached is a copy of the responses you wrote.', ''];
  if (mail.protected) {
    lines.push(
      'The document is encrypted with the password you chose. We do not have it',
      'and cannot reset it.',
      '',
    );
  }
  if (mail.resendUrl) {
    lines.push(
      'If the password does not work, you can request a fresh copy -- with a new',
      'password -- using the link below. It expires in seven days.',
      '',
      mail.resendUrl,
      '',
    );
  }
  lines.push('aformulationoftruth.com');
  return lines.join('\n');
}

const SENDER = new URL('./send_mail.py', import.meta.url).pathname;

export async function sendDelivery(mail: DeliveryMail): Promise<void> {
  const from = Deno.env.get('FROM_EMAIL') || Deno.env.get('SMTP_USER');
  if (!from) throw new Error('SMTP not configured');

  const pdfPath = `${mail.workDir}/outgoing.pdf`;
  const specPath = `${mail.workDir}/mail.json`;

  try {
    await Deno.writeFile(pdfPath, mail.pdf, { mode: 0o600 });
    await Deno.writeTextFile(
      specPath,
      JSON.stringify({
        to: mail.to,
        from: `a formulation of truth <${from}>`,
        subject: 'your responses',
        body: body(mail),
        pdf_path: pdfPath,
        filename: mail.filename,
      }),
      { mode: 0o600 },
    );

    const res = await new Deno.Command('python3', {
      args: [SENDER, specPath],
      stdout: 'null',
      // Discarded: an SMTP error can echo the envelope, and the address is the
      // one piece of PII here.
      stderr: 'null',
    }).output();
    if (!res.success) throw new Error('smtp send failed');
  } finally {
    for (const p of [pdfPath, specPath]) await Deno.remove(p).catch(() => {});
  }
}

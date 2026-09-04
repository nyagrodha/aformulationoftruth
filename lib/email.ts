/**
 * Email Utilities - Apple iCloud SMTP
 *
 * Delivery goes through smtp.mail.me.com (Apple) via authenticated SMTP.
 * SendGrid is intentionally not used.
 *
 * gupta-vidya compliance:
 * - Email addresses used only for delivery
 * - No email address or content is ever logged
 * - Minimal data in email body
 */

import { fromFileUrl } from '$std/path/mod.ts';

/**
 * fromFileUrl, not URL.pathname: pathname keeps percent-encoding, so an
 * installation path containing a space would hand python3 a literal "%20" and
 * the script would not be found.
 */
const SENDER = fromFileUrl(new URL('./send_mail.py', import.meta.url));

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/** What one invocation of send_mail.py reported. */
export interface SenderOutcome {
  success: boolean;
  /** The SMTP reply code, when the failure carried one. */
  code?: number;
  /** Exception class name — 'SMTPAuthenticationError', 'TimeoutError', 'Unknown'. */
  kind: string;
}

/**
 * Read the sender's one-line failure summary.
 *
 * send_mail.py prints `code=<int|none> kind=<ClassName>` and nothing else, so
 * this parses a contract rather than guessing at prose. It is deliberately
 * strict: anything that does not match that exact shape yields no code at all,
 * because a wrong code is worse than none — a fabricated 5xx would stop the
 * retry that a transient fault needs.
 */
export function parseSenderOutcome(stdout: string): Omit<SenderOutcome, 'success'> {
  const match = /^code=(none|[2-5]\d{2}) kind=(\w+)$/m.exec(stdout.trim());
  if (!match) return { kind: 'Unknown' };
  return {
    code: match[1] === 'none' ? undefined : Number(match[1]),
    kind: match[2],
  };
}

/**
 * Hand one message to send_mail.py.
 *
 * The recipient and the body go in a 0600 file in a private temp directory,
 * removed in a `finally`; the path is the only argument, because
 * /proc/<pid>/cmdline is world-readable. Credentials go in the child's
 * environment, which is not — and the environment is cleared first, so a
 * mail subprocess never inherits DATABASE_URL or the JWT secret.
 *
 * stderr is discarded rather than captured. A Python traceback can hold the
 * envelope, and there is no safe way to log a fragment of one.
 */
async function runSender(
  spec: Record<string, string>,
  smtpEnv: Record<string, string>,
): Promise<SenderOutcome> {
  let dir: string;
  try {
    dir = await Deno.makeTempDir({ prefix: 'a4t-mail-' });
  } catch (error) {
    return { success: false, kind: error instanceof Error ? error.name : 'Unknown' };
  }

  try {
    await Deno.writeTextFile(`${dir}/mail.json`, JSON.stringify(spec), { mode: 0o600 });

    const result = await new Deno.Command('python3', {
      args: [SENDER, `${dir}/mail.json`],
      clearEnv: true,
      env: { PATH: '/usr/bin:/bin', ...smtpEnv },
      stdout: 'piped',
      stderr: 'null',
    }).output();

    if (result.success) return { success: true, kind: 'none' };
    return { success: false, ...parseSenderOutcome(new TextDecoder().decode(result.stdout)) };
  } catch (error) {
    // Spawn failed — python3 missing, temp directory unwritable. The class
    // name is safe; the message could name a path we would rather not print.
    return { success: false, kind: error instanceof Error ? error.name : 'Unknown' };
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

/**
 * Send email via Apple iCloud SMTP.
 *
 * Delegates to send_mail.py — see that file for why this is a subprocess and
 * not a Deno SMTP client.
 *
 * Reads connection settings from the environment:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL
 * SMTP_SECURE=true selects implicit TLS (port 465); otherwise STARTTLS is
 * used (port 587), which is Apple's default submission port.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const hostname = Deno.env.get('SMTP_HOST');
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587', 10);
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true';
  const username = Deno.env.get('SMTP_USER');
  const password = Deno.env.get('SMTP_PASS');
  const fromEmail = Deno.env.get('FROM_EMAIL') || username;
  const fromName = Deno.env.get('SMTP_FROM_NAME') || 'a formulation of truth';

  if (!hostname || !username || !password || !fromEmail) {
    console.error('[email] SMTP not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const spec = {
    to: options.to,
    from: `${fromName} <${fromEmail}>`,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };
  const smtpEnv = {
    SMTP_HOST: hostname,
    SMTP_PORT: String(port),
    SMTP_SECURE: implicitTls ? 'true' : 'false',
    SMTP_USER: username,
    SMTP_PASS: password,
  };

  // Apple intermittently drops or throttles connections: roughly 1-7 sends a
  // day failed with kind=TimedOut and no reply code, against a far larger
  // number that succeeded. A fresh subprocess per attempt with a short backoff
  // clears it; the failure is transient, not a misconfiguration.
  const MAX_ATTEMPTS = 3;
  let outcome: SenderOutcome = { success: false, kind: 'Unknown' };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    outcome = await runSender(spec, smtpEnv);

    if (outcome.success) {
      // Log successes too. Without this the journal shows only failures, which
      // makes "3 failures out of 3" indistinguishable from "3 out of 300" —
      // and those call for opposite responses. A bare count carries no PII, so
      // the zero-logging policy never required this silence.
      console.log(`[email] sent attempt=${attempt}`);
      return { success: true, statusCode: 250 };
    }

    // A permanent rejection (5xx) will fail identically every time; only
    // retry transport-level faults and Apple's 4xx "try later" codes.
    const worthRetrying = outcome.code === undefined || outcome.code < 500;
    if (attempt < MAX_ATTEMPTS && worthRetrying) {
      console.error(
        `[email] retrying after code=${outcome.code ?? 'none'} kind=${outcome.kind} attempt=${attempt}`,
      );
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      continue;
    }
    break;
  }

  // Zero-logging: never surface the recipient or a raw error (either may echo
  // the envelope). A reply code and an exception class name are both PII-free,
  // and they are the difference between "mail broke" and "Apple threw 421 at
  // us for sending too fast" — which is the whole of the diagnosis.
  console.error(`[email] SMTP send failed code=${outcome.code ?? 'none'} kind=${outcome.kind}`);
  return {
    success: false,
    statusCode: outcome.code,
    // A fixed string, never the underlying message: callers put this in
    // responses, and the message can carry the address.
    error: 'SMTP send failed',
  };
}

/**
 * Send magic link email for questionnaire access
 */
export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<SendEmailResult> {
  const subject = Deno.env.get('EMAIL_SUBJECT') || 'Your link to a formulation of truth';

  const text = `
You requested access to a formulation of truth.

Click here to continue your questionnaire:
${magicLinkUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

---
a formulation of truth
https://aformulationoftruth.com
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Georgia', serif;
      background: #000;
      color: #ccc;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background: #0a0a0a;
      border: 1px solid #222;
      padding: 40px;
    }
    h1 {
      font-size: 18px;
      font-weight: normal;
      color: #fff;
      margin: 0 0 30px 0;
      letter-spacing: 0.05em;
    }
    p {
      line-height: 1.7;
      margin: 0 0 20px 0;
      color: #999;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #ff69b4 0%, #ff8c42 100%);
      color: #000 !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 20px 0;
    }
    .link {
      word-break: break-all;
      color: #666;
      font-size: 12px;
      font-family: monospace;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #222;
      font-size: 12px;
      color: #555;
    }
    .tamil {
      font-family: 'Noto Serif Tamil', serif;
      color: #ff69b4;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>a formulation of truth</h1>

    <p>You requested access to continue your questionnaire.</p>

    <p>
      <a href="${magicLinkUrl}" class="button">Continue Questionnaire</a>
    </p>

    <p>Or copy this link:</p>
    <p class="link">${magicLinkUrl}</p>

    <p style="color: #666; font-size: 13px;">
      This link expires in 15 minutes and can only be used once.
    </p>

    <div class="footer">
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p><span class="tamil">உண்மை</span> &mdash; truth</p>
    </div>
  </div>
</body>
</html>
`;

  return await sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}

/**
 * Send newsletter confirmation email (double opt-in)
 */
export async function sendNewsletterConfirmationEmail(
  email: string,
  confirmUrl: string,
  unsubscribeUrl: string,
): Promise<SendEmailResult> {
  const subject = 'Confirm your subscription to a formulation of truth';

  const text = `
Please confirm your subscription to the a formulation of truth newsletter.

Click here to confirm:
${confirmUrl}

This link expires in 24 hours.

If you didn't subscribe, you can safely ignore this email or unsubscribe here:
${unsubscribeUrl}

---
a formulation of truth
https://aformulationoftruth.com
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Georgia', serif;
      background: #000;
      color: #ccc;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background: #0a0a0a;
      border: 1px solid #222;
      padding: 40px;
    }
    h1 {
      font-size: 18px;
      font-weight: normal;
      color: #fff;
      margin: 0 0 30px 0;
      letter-spacing: 0.05em;
    }
    p {
      line-height: 1.7;
      margin: 0 0 20px 0;
      color: #999;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #00ff88 0%, #0af 100%);
      color: #000 !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 20px 0;
      border-radius: 4px;
    }
    .link {
      word-break: break-all;
      color: #666;
      font-size: 12px;
      font-family: monospace;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #222;
      font-size: 12px;
      color: #555;
    }
    .footer a {
      color: #888;
    }
    .tamil {
      font-family: 'Noto Serif Tamil', serif;
      color: #00ff88;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>a formulation of truth</h1>

    <p>Please confirm your subscription to our newsletter.</p>

    <p>
      <a href="${confirmUrl}" class="button">Confirm Subscription</a>
    </p>

    <p>Or copy this link:</p>
    <p class="link">${confirmUrl}</p>

    <p style="color: #666; font-size: 13px;">
      This link expires in 24 hours.
    </p>

    <div class="footer">
      <p>If you didn't subscribe, you can safely ignore this email.</p>
      <p>Or <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>
      <p><span class="tamil">உண்மை</span> &mdash; truth</p>
    </div>
  </div>
</body>
</html>
`;

  return await sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}

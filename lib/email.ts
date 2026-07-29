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

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

/**
 * Pull the SMTP reply code out of a thrown error, when there is one.
 *
 * Only the integer is ever returned — never the surrounding message, which can
 * echo the envelope and therefore the recipient. The patterns are anchored
 * deliberately: a bare /\d{3}/ search would happily match digits inside an
 * address, and three digits of a recipient is still a fingerprint under the
 * zero-logging policy. Better to report no code than to guess one.
 *
 * Transport failures (refused connection, TLS handshake, timeout) carry no
 * reply code at all — those surface as a kind instead, see smtpFailureKind.
 */
function smtpReplyCode(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const match = /^\s*([2-5]\d{2})[\s-]/.exec(message) ||
    /\bgot\s+([2-5]\d{2})\b/i.exec(message) ||
    /\bcode[:=\s]+([2-5]\d{2})\b/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

/**
 * The error's class name — 'ConnectionRefused', 'TimedOut', 'Error'. A
 * constructor name carries no user data, so it is safe to log verbatim and
 * tells transport failures apart from server rejections.
 */
function smtpFailureKind(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'Unknown';
}

/**
 * Send email via Apple iCloud SMTP.
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

  // Apple intermittently drops or throttles connections: roughly 1-7 sends a
  // day failed with kind=TimedOut and no reply code, against a far larger
  // number that succeeded. A fresh client per attempt with a short backoff
  // clears it; the failure is transient, not a misconfiguration.
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = new SMTPClient({
      connection: {
        hostname,
        port,
        tls: implicitTls,
        auth: { username, password },
      },
    });

    try {
      await client.send({
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        content: options.text,
        html: options.html,
      });
      // Log successes too. Without this the journal shows only failures, which
      // makes "3 failures out of 3" indistinguishable from "3 out of 300" —
      // and those call for opposite responses. A bare count carries no PII, so
      // the zero-logging policy never required this silence.
      console.log(`[email] sent attempt=${attempt}`);
      return { success: true, statusCode: 250 };
    } catch (error) {
      lastError = error;
      const code = smtpReplyCode(error);
      const kind = smtpFailureKind(error);

      // A permanent rejection (5xx) will fail identically every time; only
      // retry transport-level faults and Apple's 4xx "try later" codes.
      const worthRetrying = code === undefined || code < 500;
      if (attempt < MAX_ATTEMPTS && worthRetrying) {
        console.error(`[email] retrying after code=${code ?? 'none'} kind=${kind} attempt=${attempt}`);
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }
      break;
    } finally {
      try {
        await client.close();
      } catch { /* already closed */ }
    }
  }

  {
    const error = lastError;
    // Zero-logging: never surface the recipient or full error (may echo the
    // envelope). A reply code and an error class name are both PII-free, and
    // they are the difference between "mail broke" and "Apple threw 421 at us
    // for sending too fast" — which is the whole of the diagnosis.
    const statusCode = smtpReplyCode(error);
    console.error(
      `[email] SMTP send failed code=${statusCode ?? 'none'} kind=${smtpFailureKind(error)}`,
    );
    return {
      success: false,
      statusCode,
      error: error instanceof Error ? error.message : 'SMTP send failed',
    };
  }
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

  return sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}

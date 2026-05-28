/**
 * Email Utilities — iCloud SMTP (Custom Email Domain alias).
 *
 * Sends via Apple's SMTP relay (`smtp.mail.me.com:587`, STARTTLS) using an
 * app-specific password. The From address must be a Custom Email Domain
 * alias verified under the SMTP_USER Apple ID.
 *
 * gupta-vidya compliance:
 * - Recipient addresses are used only for delivery (never logged in clear).
 * - Email content is not persisted server-side.
 * - SMTP credentials live in .env (0600), never in the database.
 */

import { SMTPClient } from 'denomailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

function maskAddr(addr: string): string {
  return addr.replace(/(.{2}).*(@.*)/, '$1***$2');
}

/**
 * Send one email through iCloud SMTP. A fresh SMTPClient is created per
 * send and closed afterwards — cheap, predictable, no shared state.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  const host = Deno.env.get('SMTP_HOST') || 'smtp.mail.me.com';
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const fromEmail =
    Deno.env.get('EMAIL_FROM_EMAIL') ||
    'formitselfisemptiness@aformulationoftruth.com';
  const fromName =
    Deno.env.get('EMAIL_FROM_NAME') ||
    'a formulation of truth';

  if (!user || !pass) {
    console.error('[email] SMTP_USER/SMTP_PASS not configured');
    return { success: false, error: 'Email service not configured' };
  }

  // Use implicit TLS on 465 (denomailer's STARTTLS path on 587 has a
  // BadResource bug against iCloud — port 465 SMTPS avoids it). If you set
  // SMTP_PORT to 587, we'll fall back to STARTTLS.
  const useImplicitTls = port === 465;
  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: useImplicitTls,
      auth: { username: user, password: pass },
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
    console.log('[email] Sent successfully to:', maskAddr(options.to));
    return { success: true, statusCode: 250 };
  } catch (error) {
    console.error('[email] iCloud SMTP error:', error);
    return { success: false, error: String(error) };
  } finally {
    try {
      await client.close();
    } catch (_) {
      // best-effort
    }
  }
}

/**
 * Send magic link email for questionnaire access.
 */
export async function sendMagicLinkEmail(
  email: string,
  magicLinkUrl: string,
): Promise<SendResult> {
  const subject = 'Your link to a formulation of truth';

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
 * Send newsletter confirmation email (double opt-in).
 */
export async function sendNewsletterConfirmationEmail(
  email: string,
  confirmUrl: string,
  unsubscribeUrl: string,
): Promise<SendResult> {
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

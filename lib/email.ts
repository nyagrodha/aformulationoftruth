/**
 * Email Utilities - SendGrid Integration
 *
 * gupta-vidya compliance:
 * - Email addresses used only for delivery
 * - No email content logged or stored
 * - Minimal data in email body
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendGridResponse {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Send email via SendGrid Web API v3
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendGridResponse> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@aformulationoftruth.com';
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') || 'a formulation of truth';
  const replyTo = Deno.env.get('SENDGRID_REPLY_TO');

  if (!apiKey) {
    console.error('[email] SENDGRID_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const payload = {
    personalizations: [
      {
        to: [{ email: options.to }],
      },
    ],
    from: {
      email: fromEmail,
      name: fromName,
    },
    ...(replyTo && { reply_to: { email: replyTo } }),
    subject: options.subject,
    content: [
      { type: 'text/plain', value: options.text },
      { type: 'text/html', value: options.html },
    ],
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 202) {
      console.log('[email] Sent successfully to:', options.to.replace(/(.{2}).*(@.*)/, '$1***$2'));
      return { success: true, statusCode: 202 };
    }

    const errorText = await response.text();
    console.error('[email] SendGrid error:', response.status, errorText);
    return { success: false, statusCode: response.status, error: errorText };
  } catch (error) {
    console.error('[email] Network error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send magic link email for questionnaire access
 */
export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<SendGridResponse> {
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

  return sendEmail({
    to: email,
    subject,
    text: text.trim(),
    html,
  });
}

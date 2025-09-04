import nodemailer from 'nodemailer';

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE,
  SMTP_USER, SMTP_PASS,
  FROM_EMAIL, PUBLIC_URL
} = process.env;

export async function sendMagicLink({ to, url }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[auth] SMTP not fully configured; printing link instead:', url);
    return; // no-throw: dev-safe
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE) === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const from = `"Karuppacāmi Nirmeyappōr" <${FROM_EMAIL || SMTP_USER}>`;
  const text = `a formulation of truth — sign in

Open this link to sign in (expires in 15 minutes):
${url}

If you didn’t request this, ignore this email.`;

  const html = `
  <!doctype html><html><body style="background:#000;color:#eee">
    <div style="text-align:center;margin:24px 0;font-weight:700;color:#ffc891">a formulation of truth</div>
    <p>Tap to sign in (expires in <b>15 minutes</b>):</p>
    <p><a href="${url}" style="background:#ff8c00;color:#000;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:700">Sign in 🔑</a></p>
    <p style="font-size:12px;color:#bbb">If the button doesn’t work, paste this URL:<br>${url}</p>
  </body></html>`;

  await transporter.sendMail({
    from, to,
    subject: 'Sign in · aformulationoftruth.com',
    text, html,
  });
}

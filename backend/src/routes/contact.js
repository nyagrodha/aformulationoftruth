// backend/src/routes/contact.js
import { Router } from 'express';
import nodemailer from 'nodemailer';

const router = Router();

router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ ok:false, error:'missing_fields' });
  }

  try {
    // reuse your SMTP settings used for magic links
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const to = process.env.CONTACT_TO || 'formitselfisemptiness@aformulationoftruth.com';
    const fromName = 'a formulation of truth';
    const fromAddr = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to,
      replyTo: `"${name}" <${email}>`,
      subject: `[a4m] ${subject}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `<p><strong>From:</strong> ${name} &lt;${email}&gt;</p><pre>${message}</pre>`
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'send_failed' });
  }
});

export default router;

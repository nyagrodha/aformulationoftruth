//Apotropaic Link email.js
// backend/utils/email.js

import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import mjml2html from 'mjml';
import { DateTime } from 'luxon';  // install luxon for easy TZ handling

// Configure your SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/** Load & compile MJML or HTML email template */
function renderTemplate(templateName, variables = {}) {
  const templateDir = path.resolve(process.cwd(), 'templates');
  const mjmlPath = path.join(templateDir, `${templateName}.mjml`);
  let raw = fs.existsSync(mjmlPath)
    ? fs.readFileSync(mjmlPath, 'utf8')
    : fs.readFileSync(path.join(templateDir, `${templateName}.html`), 'utf8');

  // interpolate {{var}}
  Object.entries(variables).forEach(([key, value]) => {
    raw = raw.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  });

  return fs.existsSync(mjmlPath)
    ? mjml2html(raw).html
    : raw;
}

/** Send magic link (referred to as apotropaic to users) with optional Shiva teaching */
export async function sendMagicLink(to, link) {
  // get current time in America/Chicago
  const now = DateTime.now().setZone('America/Chicago');
  let shivaTeaching = '';

  if (now.hour === 1 && now.minute <= 14) {
    shivaTeaching = `
✨ In this auspicious Bhairava hour, Abhinavagupta in the Tantrasāra teaches:
“Fix your gaze gently on a point on the wall, keep the eyes softly open,
and rest in the silent pause just beyond the out-breath, beyond the tip of the nose,
to awaken Bhairava consciousness.” ✨`;
  }

  const html = renderTemplate('magic-link', {
    link,
    shivaTeaching
  });

  return transporter.sendMail({
    to,
    from: process.env.EMAIL_FROM,
    subject: 'Your Login Link 🔑✨to the Proust Questionnaire',
    html,
  });
}

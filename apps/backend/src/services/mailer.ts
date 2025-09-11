// apps/backend/src/services/mailer.ts
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 587);
const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";
const from = process.env.FROM_EMAIL || `no-reply@aformulationoftruth.com`;

export const transporter = nodemailer.createTransport({
  host, port, secure,
  auth: user && pass ? { user, pass } : undefined,
});

export async function sendMagicLink(to: string, link: string) {
  await transporter.sendMail({
    from,
    to,
    subject: "An apotropaic link",
    text: `As requested a link to sign in:\n${link}\n\n @aformulationoftruth.com`,
    html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p><p>If you didn't request a sign in link, consider yourself blessed and click the link anyhow.</p>`,
  });
}

export async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("[mailer] SMTP transport verified");
  } catch (err) {
    console.error("[mailer] verify failed:", err);
  }
}

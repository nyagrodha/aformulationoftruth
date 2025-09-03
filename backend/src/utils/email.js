import nodemailer from "nodemailer";

const {
  SMTP_HOST = "smtp.mail.me.com",
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  EMAIL_DEBUG,
} = process.env;

export function makeTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: false,          // STARTTLS on 587
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { servername: SMTP_HOST, minVersion: "TLSv1.2" },
    logger: EMAIL_DEBUG === "1",
    debug:  EMAIL_DEBUG === "1",
  });
}

// Generic signature expected by your caller:
//   sendMagicLink({ to, subject, text, html })
export async function sendMagicLink({ to, subject, text, html }) {
  if (!to) throw new Error("sendMagicLink: 'to' is required");
  if (!html && !text) throw new Error("sendMagicLink: 'html' or 'text' required");

  const transporter = makeTransport();
  return transporter.sendMail({
    from: EMAIL_FROM || SMTP_USER,
    to,
    subject: subject || "Your login link",
    text,
    html,
  });
}

import nodemailer from 'nodemailer';

interface ThankYouEmailParams {
  senderName?: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  subject?: string;
}

class EmailService {
  public transporter: nodemailer.Transporter;

  constructor() {
    if (!process.env.SMTP_HOST) {
      console.warn('[away] SMTP_HOST not set — emails will be logged to console only');
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    const baseUrl = process.env.PUBLIC_URL || 'https://awaytosaythanks.com';
    const magicLink = `${baseUrl}/?token=${token}`;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[away] Magic link for ${email}: ${magicLink}`);
      return;
    }

    await this.transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Your sign-in link — awaytosaythanks.com',
      html: `
        <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #faf7f0; border-radius: 12px;">
          <h1 style="color: #4a6a4a; font-size: 28px; margin-bottom: 8px;">a way to say thanks</h1>
          <p style="color: #6b7280; margin-bottom: 28px;">Click the link below to sign in — it expires in one hour.</p>
          <a href="${magicLink}"
             style="display: inline-block; background: #7c9a7c; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 16px;">
            Sign in
          </a>
          <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
            If you didn't request this, you can safely ignore it.
          </p>
        </div>
      `,
    });
  }

  async sendThankYou(params: ThankYouEmailParams): Promise<void> {
    const {
      senderName,
      senderEmail,
      recipientName,
      recipientEmail,
      message,
      subject,
    } = params;

    const displaySender = senderName ? `${senderName} (${senderEmail})` : senderEmail;
    const emailSubject = subject?.trim()
      || `Someone would like to say thank you to you, ${recipientName}`;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(
        `[away] Thank-you email to ${recipientEmail} from ${senderEmail}:\n${message}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: recipientEmail,
      replyTo: senderEmail,
      subject: emailSubject,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 32px; background: #faf7f0; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 36px;">
            <h1 style="color: #4a6a4a; font-size: 32px; margin: 0 0 8px;">a way to say thanks</h1>
            <div style="width: 48px; height: 2px; background: #c9a84c; margin: 12px auto;"></div>
          </div>

          <p style="font-size: 20px; color: #374151; margin-bottom: 28px;">
            Dear <strong>${recipientName}</strong>,
          </p>

          <blockquote style="
            border-left: 4px solid #c9a84c;
            margin: 0 0 28px;
            padding: 16px 20px;
            background: #fff;
            border-radius: 0 8px 8px 0;
            font-size: 18px;
            line-height: 1.7;
            color: #374151;
            font-style: italic;
          ">
            ${message.replace(/\n/g, '<br>')}
          </blockquote>

          <p style="color: #6b7280; font-size: 15px;">
            With gratitude,<br>
            <strong>${displaySender}</strong>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 36px 0;">

          <p style="font-size: 12px; color: #9ca3af; text-align: center;">
            Sent via <a href="https://awaytosaythanks.com" style="color: #7c9a7c;">awaytosaythanks.com</a>
          </p>
        </div>
      `,
    });
  }
}

export const emailService = new EmailService();

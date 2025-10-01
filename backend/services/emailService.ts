
import nodemailer from 'nodemailer';
import type { Response } from '../shared/schema';
import { questionService } from './questionService';

class EmailService {
  public transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mail.me.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendCompletionEmail(email: string, pdfBuffer: Buffer): Promise<void> {
    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Your Proust Questionnaire Results',
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #1976D2; font-size: 32px; margin-bottom: 10px;">Your Proust Questionnaire</h1>
            <p style="color: #666; font-size: 18px;">A reflection of your inner thoughts</p>
            <div style="width: 60px; height: 3px; background: #1976D2; margin: 20px auto;"></div>
          </div>
          
          <div style="text-align: center; padding: 30px; background: #1976D2; color: white; border-radius: 10px;">
            <h3 style="margin-bottom: 15px; font-size: 20px;">Thank you for your thoughtful responses</h3>
            <p style="margin: 0; opacity: 0.9;">Your questionnaire has been attached as a PDF for safekeeping.</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 14px; text-align: center;">
            <p>om shree ganapataye namah • நான் யார் (who am I?) • a practice in self-inquiry revealing the formulation of truth within</p>
            <p style="font-style: italic; margin-top: 10px;">This I-I perceive and upon it all that I know and all that I touch and all that I taste and all I create as though a projection</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'formulation-of-truth.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await this.transporter.sendMail(mailOptions);
  }
}

export const emailService = new EmailService();

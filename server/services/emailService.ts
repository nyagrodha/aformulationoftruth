import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import type { Response } from '@shared/schema';
import { questionService } from './questionService';
import { getPublicAppUrl } from '../utils/env';

class EmailService {
  public transporter: nodemailer.Transporter;
  private useSendGrid: boolean;

  constructor() {
    // Initialize SendGrid if API key is available
    this.useSendGrid = !!process.env.SENDGRID_API_KEY;

    if (this.useSendGrid) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
      console.log('EmailService initialized with SendGrid');
    } else {
      // Fallback to nodemailer/SMTP
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
        },
      });
      console.log('EmailService initialized with SMTP');
    }
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    const baseUrl = getPublicAppUrl();
    const url = new URL('/auth.html', baseUrl);
    url.searchParams.set('token', token);
    const magicLink = url.toString();

    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1976D2; font-size: 28px; margin-bottom: 10px;">Proust Questionnaire</h1>
          <p style="color: #666; font-size: 16px;">Your journey of self-discovery awaits</p>
        </div>

        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin-bottom: 25px;">
          <h2 style="color: #424242; font-size: 20px; margin-bottom: 15px;">Your Apotropaic Link</h2>
          <p style="color: #666; margin-bottom: 20px;">
            Click the link below to access your personalized Proust Questionnaire. This link will expire in 1 hour.
          </p>

          <div style="text-align: center;">
            <a href="${magicLink}"
               style="background: #1976D2; color: white; padding: 12px 30px; border-radius: 8px;
                      text-decoration: none; font-weight: 500; display: inline-block;">
              Begin Questionnaire
            </a>
          </div>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 20px; color: #999; font-size: 14px;">
          <p>This link is unique to your email address and will allow you to resume your progress at any time.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `;

    if (this.useSendGrid) {
      const msg = {
        to: email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@aformulationoftruth.com',
          name: process.env.SENDGRID_FROM_NAME || 'A Formulation of Truth',
        },
        replyTo: process.env.SENDGRID_REPLY_TO,
        subject: 'Your Apotropaic Link - Proust Questionnaire',
        html: htmlContent,
      };

      await sgMail.send(msg);
      console.log(`Magic link sent via SendGrid to ${email}`);
    } else {
      // Fallback to SMTP
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`Magic link for ${email}: ${magicLink}`);
        return;
      }

      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to: email,
        subject: 'Your Apotropaic Link - Proust Questionnaire',
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Magic link sent via SMTP to ${email}`);
    }
  }

  async sendCompletionEmail(email: string, pdfBuffer: Buffer): Promise<void> {
    return this.sendResults(email, [], pdfBuffer);
  }

  async sendResults(email: string, responses: Response[], pdfBuffer: Buffer): Promise<void> {
    const questionsAndAnswers = responses
      .map(response => {
        const question = questionService.getQuestion(response.questionId);
        return { question: question?.text || `Question ${response.questionId}`, answer: response.answer };
      })
      .sort((a, b) => {
        const aOrder = questionService.getQuestionDisplayOrder(responses.find(r => r.answer === a.answer)?.questionId || 0);
        const bOrder = questionService.getQuestionDisplayOrder(responses.find(r => r.answer === b.answer)?.questionId || 0);
        return aOrder - bOrder;
      });

    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 700px; margin: 0 auto; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div style="text-align: center; padding: 60px 20px 40px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
          <img src="https://aformulationoftruth.com/images/itendu2.PNG" alt="" style="max-width: 180px; height: auto; margin: 0 auto 30px; filter: drop-shadow(0 0 30px rgba(102, 126, 234, 0.6));" />
          <div style="font-family: 'Orbitron', monospace; font-size: 120px; font-weight: 700; color: #00fff7; text-shadow: 0 0 40px rgba(0, 255, 247, 0.8), 0 0 80px rgba(0, 255, 247, 0.4); line-height: 1; margin: 30px 0; animation: glow 2s ease-in-out infinite;">@</div>
          <h1 style="color: #ffffff; font-size: 32px; font-weight: 300; margin: 30px 0; letter-spacing: 3px; text-transform: lowercase; text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);">a formulation of truth</h1>
          <div style="width: 100px; height: 2px; background: linear-gradient(90deg, transparent, #00fff7, transparent); margin: 30px auto;"></div>
        </div>
        <div style="padding: 20px; background: #ffffff;">

        <div style="margin-bottom: 30px;">
          ${questionsAndAnswers.map((qa, index) => `
            <div style="margin-bottom: 35px; padding: 25px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid #1976D2;">
              <h3 style="color: #424242; font-size: 18px; margin-bottom: 15px; font-weight: 600;">
                ${index + 1}. ${qa.question}
              </h3>
              <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0; font-style: italic;">
                "${qa.answer}"
              </p>
            </div>
          `).join('')}
        </div>

        <div style="text-align: center; padding: 30px; background: #1976D2; color: white; border-radius: 10px;">
          <h3 style="margin-bottom: 15px; font-size: 20px;">Thank you for your thoughtful responses</h3>
          <p style="margin: 0; opacity: 0.9;">Your questionnaire has been attached as a PDF for safekeeping.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 14px; text-align: center;">
          <p>✦ your responses offer a formulation of truth ✦</p>
        </div>
      </div>
    </div>
    `;

    if (this.useSendGrid) {
      const msg = {
        to: email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@aformulationoftruth.com',
          name: process.env.SENDGRID_FROM_NAME || 'A Formulation of Truth',
        },
        replyTo: process.env.SENDGRID_REPLY_TO,
        subject: 'Your responses to the Proust Questionnaire',
        html: htmlContent,
        attachments: [
          {
            filename: 'formulation-of-truth.pdf',
            content: pdfBuffer.toString('base64'),
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
      };

      await sgMail.send(msg);
      console.log(`Results sent via SendGrid to ${email}`);
    } else {
      // Fallback to SMTP
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`Results ready for ${email} with ${responses.length} responses and PDF generated`);
        return;
      }

      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to: email,
        subject: 'Your responses to the Proust Questionnaire',
        html: htmlContent,
        attachments: [
          {
            filename: 'formulation-of-truth.pdf',
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Results sent via SMTP to ${email}`);
    }
  }
}

export const emailService = new EmailService();

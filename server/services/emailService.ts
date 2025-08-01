import nodemailer from 'nodemailer';
import type { Response } from '@shared/schema';
import { questionService } from './questionService';

class EmailService {
  public transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
      },
    });
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`Magic link for ${email}: ${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}/auth?token=${token}`);
      return;
    }

    const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
    const magicLink = `https://${baseUrl}/auth?token=${token}`;

    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Your Apotropaic Link - Proust Questionnaire',
      html: `
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
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendCompletionEmail(email: string, pdfBuffer: Buffer): Promise<void> {
    return this.sendResults(email, [], pdfBuffer);
  }

  async sendResults(email: string, responses: Response[], pdfBuffer: Buffer): Promise<void> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`Results ready for ${email} with ${responses.length} responses and PDF generated`);
      return;
    }

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
            <p>om shree ganapataye namah • a practice in self-inquiry revealing the formulation of truth within</p>
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

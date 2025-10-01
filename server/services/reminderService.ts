
import { storage } from '../storage';
import { emailService } from './emailService';

class ReminderService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  // Convert 5688000 seconds to milliseconds
  private readonly BASE_PERIOD_MS = 5688000 * 1000; // ~66 days
  private readonly MAX_PERIOD_MS = 379 * 24 * 60 * 60 * 1000; // 379 days

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    // Check for reminders every hour
    this.intervalId = setInterval(() => {
      this.checkAndSendReminders().catch(console.error);
    }, 60 * 60 * 1000);

    console.log('Reminder service started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Reminder service stopped');
  }

  private generateVariablePeriod(): number {
    // Generate random period between base period (66 days) and max period (379 days)
    const minMs = this.BASE_PERIOD_MS;
    const maxMs = this.MAX_PERIOD_MS;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }

  private async checkAndSendReminders(): Promise<void> {
    try {
      const eligibleSessions = await storage.getSessionsEligibleForReminders();
      
      for (const session of eligibleSessions) {
        const user = await storage.getUser(session.userId);
        if (!user?.email) continue;

        // Calculate if enough time has passed for this specific user
        const completedAt = new Date(session.completedAt!);
        const timeSinceCompletion = Date.now() - completedAt.getTime();
        
        // Use stored reminder period or generate new one
        let reminderPeriod = session.reminderPeriodMs;
        if (!reminderPeriod) {
          reminderPeriod = this.generateVariablePeriod();
          await storage.updateSessionReminderPeriod(session.id, reminderPeriod);
        }

        if (timeSinceCompletion >= reminderPeriod) {
          await this.sendReminderEmail(user.email, user.firstName || 'Friend');
          await storage.markReminderSent(session.id);
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  private async sendReminderEmail(email: string, firstName: string): Promise<void> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`Reminder ready for ${email}`);
      return;
    }

    const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
    const questionnaireLinkUrl = `https://${baseUrl}/`;

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Time for Another Journey of Self-Discovery',
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1976D2; font-size: 28px; margin-bottom: 10px;">Proust Questionnaire</h1>
            <p style="color: #666; font-size: 16px;">Your path of self-inquiry continues</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin-bottom: 25px;">
            <h2 style="color: #424242; font-size: 20px; margin-bottom: 15px;">Hello ${firstName},</h2>
            <p style="color: #666; margin-bottom: 20px;">
              The wheel of time has turned, and you are now eligible to undertake the Proust Questionnaire once more. 
              How have your thoughts evolved? What new insights await discovery?
            </p>
            
            <div style="text-align: center;">
              <a href="${questionnaireLinkUrl}" 
                 style="background: #1976D2; color: white; padding: 12px 30px; border-radius: 8px; 
                        text-decoration: none; font-weight: 500; display: inline-block;">
                Begin New Questionnaire
              </a>
            </div>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; color: #999; font-size: 14px;">
            <p>The interval between questionnaires varies for each participant, creating space for genuine transformation.</p>
            <p>If you no longer wish to receive these reminders, please ignore this email.</p>
          </div>
        </div>
      `,
    };

    await emailService.transporter.sendMail(mailOptions);
  }
}

export const reminderService = new ReminderService();

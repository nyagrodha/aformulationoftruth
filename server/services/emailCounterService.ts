/**
 * Email Counter Service
 * Tracks daily email counts with automatic midnight reset
 * Sends daily summaries via Telegram AND email
 * Persists counts to file for durability across restarts
 */

import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { telegramAlertService } from './telegramAlertService';

interface DailyStats {
  date: string;  // YYYY-MM-DD format
  total: number;
  byProvider: {
    sendgrid: number;
    smtp: number;
  };
  byType: {
    magicLink: number;
    questionnairePdf: number;
    reminder: number;
    other: number;
  };
  failures: number;
  lastEmailAt: string | null;
}

interface CounterState {
  current: DailyStats;
  history: DailyStats[];  // Keep last 30 days
  warnings: {
    highCountThreshold: number;
    criticalCountThreshold: number;
  };
}

type EmailType = 'magicLink' | 'questionnairePdf' | 'reminder' | 'other';
type Provider = 'sendgrid' | 'smtp';

class EmailCounterService {
  private state: CounterState;
  private readonly stateFilePath: string;
  private readonly HISTORY_DAYS = 30;
  private readonly DEFAULT_HIGH_THRESHOLD = 80;
  private readonly DEFAULT_CRITICAL_THRESHOLD = 95;
  private midnightResetTimer: NodeJS.Timeout | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.stateFilePath = process.env.EMAIL_COUNTER_STATE_PATH ||
      path.join('/var/log/aformulationoftruth', 'email-counter-state.json');

    this.state = this.loadState();
    this.checkAndResetIfNewDay();
    this.scheduleMidnightReset();
    this.initializeSmtpTransporter();

    console.log(`✓ Email Counter Service initialized (Today: ${this.state.current.total} emails)`);
  }

  /**
   * Initialize SMTP transporter for sending daily reports
   */
  private initializeSmtpTransporter(): void {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('✓ SMTP transporter ready for daily reports');
    }
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Create empty stats for a new day
   */
  private createEmptyStats(date: string): DailyStats {
    return {
      date,
      total: 0,
      byProvider: { sendgrid: 0, smtp: 0 },
      byType: { magicLink: 0, questionnairePdf: 0, reminder: 0, other: 0 },
      failures: 0,
      lastEmailAt: null,
    };
  }

  /**
   * Load state from file or create new
   */
  private loadState(): CounterState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        const loaded = JSON.parse(data) as CounterState;
        console.log(`📊 Loaded email counter state from ${this.stateFilePath}`);
        return loaded;
      }
    } catch (error) {
      console.error('Failed to load email counter state:', error);
    }

    return {
      current: this.createEmptyStats(this.getCurrentDate()),
      history: [],
      warnings: {
        highCountThreshold: parseInt(process.env.EMAIL_HIGH_THRESHOLD || String(this.DEFAULT_HIGH_THRESHOLD)),
        criticalCountThreshold: parseInt(process.env.EMAIL_CRITICAL_THRESHOLD || String(this.DEFAULT_CRITICAL_THRESHOLD)),
      },
    };
  }

  /**
   * Save state to file (debounced)
   */
  private saveState(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      try {
        const dir = path.dirname(this.stateFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        }
        fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
      } catch (error) {
        console.error('Failed to save email counter state:', error);
      }
    }, 1000);
  }

  /**
   * Check if we need to reset for a new day
   */
  private checkAndResetIfNewDay(): void {
    const today = this.getCurrentDate();
    if (this.state.current.date !== today) {
      this.performDailyReset();
    }
  }

  /**
   * Perform the daily reset and send summaries
   */
  private async performDailyReset(): Promise<void> {
    const today = this.getCurrentDate();
    const yesterday = this.state.current;

    // Archive yesterday's stats
    if (yesterday.total > 0 || yesterday.failures > 0) {
      this.state.history.unshift(yesterday);
      if (this.state.history.length > this.HISTORY_DAYS) {
        this.state.history = this.state.history.slice(0, this.HISTORY_DAYS);
      }
    }

    // Create new day stats
    this.state.current = this.createEmptyStats(today);
    this.saveState();

    console.log(`📅 Email counter reset for ${today} (Previous: ${yesterday.total} sent, ${yesterday.failures} failed)`);

    // Send daily summary via BOTH Telegram and Email
    await this.sendDailySummaryToAll(yesterday);
  }

  /**
   * Send daily summary via both Telegram and Email
   */
  private async sendDailySummaryToAll(stats: DailyStats): Promise<void> {
    const adminEmail = process.env.ADMIN_REPORT_EMAIL || process.env.ADMIN_EMAILS?.split(',')[0];

    // Send via Telegram
    await this.sendDailySummaryTelegram(stats);

    // Send via Email
    if (adminEmail) {
      await this.sendDailySummaryEmail(stats, adminEmail);
    }
  }

  /**
   * Send daily summary via Telegram
   */
  private async sendDailySummaryTelegram(stats: DailyStats): Promise<void> {
    try {
      await telegramAlertService.sendDailySummary({
        emailsSent: stats.total,
        errors: stats.failures,
        warnings: 0,
        uptime: this.getUptime(),
      });
      console.log('✓ Daily summary sent via Telegram');
    } catch (error) {
      console.error('Failed to send Telegram daily summary:', error);
    }
  }

  /**
   * Send daily summary via Email
   */
  private async sendDailySummaryEmail(stats: DailyStats, recipientEmail: string): Promise<void> {
    if (!this.smtpTransporter) {
      console.warn('SMTP not configured, skipping email daily summary');
      return;
    }

    const html = this.generateDailyReportHtml(stats);
    const text = this.generateDailyReportText(stats);

    try {
      await this.smtpTransporter.sendMail({
        from: process.env.SMTP_USER,
        to: recipientEmail,
        subject: `📊 Daily Email Report - ${stats.date} | A Formulation of Truth`,
        html,
        text,
      });
      console.log('✓ Daily summary email sent');
    } catch (error) {
      console.error('Failed to send daily summary email:', error);
      // Alert via Telegram if email fails
      await telegramAlertService.alertMailFailure(
        error as Error,
        recipientEmail,
        'smtp-daily-report'
      );
    }
  }

  /**
   * Generate HTML for daily report email
   */
  private generateDailyReportHtml(stats: DailyStats): string {
    const successRate = stats.total > 0
      ? Math.round(((stats.total - stats.failures) / stats.total) * 100)
      : 100;

    return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #eee; padding: 0;">
        <div style="background: linear-gradient(135deg, #0ff 0%, #f0f 100%); padding: 30px; text-align: center;">
          <h1 style="margin: 0; color: #000; font-size: 24px;">📊 Daily Email Report</h1>
          <p style="margin: 10px 0 0; color: #333; font-size: 14px;">A Formulation of Truth</p>
        </div>

        <div style="padding: 30px;">
          <div style="background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #0ff; margin: 0 0 15px; font-size: 18px;">📅 ${stats.date}</h2>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
              <div style="background: #1a1a2e; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #0ff;">${stats.total}</div>
                <div style="color: #888; font-size: 12px;">Emails Sent</div>
              </div>
              <div style="background: #1a1a2e; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: ${stats.failures > 0 ? '#f44' : '#4f4'};">${stats.failures}</div>
                <div style="color: #888; font-size: 12px;">Failures</div>
              </div>
            </div>
          </div>

          <div style="background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #f0f; margin: 0 0 15px; font-size: 16px;">📨 By Provider</h3>
            <table style="width: 100%; color: #ccc; font-size: 14px;">
              <tr><td style="padding: 8px 0;">SendGrid</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byProvider.sendgrid}</td></tr>
              <tr><td style="padding: 8px 0;">SMTP (Apple Mail)</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byProvider.smtp}</td></tr>
            </table>
          </div>

          <div style="background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #f0f; margin: 0 0 15px; font-size: 16px;">📋 By Type</h3>
            <table style="width: 100%; color: #ccc; font-size: 14px;">
              <tr><td style="padding: 8px 0;">Magic Links</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byType.magicLink}</td></tr>
              <tr><td style="padding: 8px 0;">Questionnaire PDFs</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byType.questionnairePdf}</td></tr>
              <tr><td style="padding: 8px 0;">Reminders</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byType.reminder}</td></tr>
              <tr><td style="padding: 8px 0;">Other</td><td style="text-align: right; font-weight: bold; color: #0ff;">${stats.byType.other}</td></tr>
            </table>
          </div>

          <div style="background: #16213e; border-radius: 12px; padding: 20px;">
            <h3 style="color: #f0f; margin: 0 0 15px; font-size: 16px;">📈 Performance</h3>
            <div style="background: #1a1a2e; padding: 15px; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #888;">Success Rate</span>
                <span style="font-size: 24px; font-weight: bold; color: ${successRate >= 95 ? '#4f4' : successRate >= 80 ? '#ff0' : '#f44'};">${successRate}%</span>
              </div>
              <div style="background: #333; height: 8px; border-radius: 4px; margin-top: 10px; overflow: hidden;">
                <div style="background: ${successRate >= 95 ? '#4f4' : successRate >= 80 ? '#ff0' : '#f44'}; height: 100%; width: ${successRate}%;"></div>
              </div>
            </div>
            ${stats.lastEmailAt ? `<p style="color: #666; font-size: 12px; margin: 15px 0 0;">Last email: ${stats.lastEmailAt}</p>` : ''}
          </div>
        </div>

        <div style="background: #0d0d1a; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">Server Uptime: ${this.getUptime()}</p>
          <p style="margin: 5px 0 0;">Generated: ${new Date().toISOString()}</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate plain text for daily report email
   */
  private generateDailyReportText(stats: DailyStats): string {
    return `
DAILY EMAIL REPORT - ${stats.date}
A Formulation of Truth
================================

SUMMARY
-------
Total Sent: ${stats.total}
Failures: ${stats.failures}
Success Rate: ${stats.total > 0 ? Math.round(((stats.total - stats.failures) / stats.total) * 100) : 100}%

BY PROVIDER
-----------
SendGrid: ${stats.byProvider.sendgrid}
SMTP: ${stats.byProvider.smtp}

BY TYPE
-------
Magic Links: ${stats.byType.magicLink}
Questionnaire PDFs: ${stats.byType.questionnairePdf}
Reminders: ${stats.byType.reminder}
Other: ${stats.byType.other}

SERVER
------
Uptime: ${this.getUptime()}
Last Email: ${stats.lastEmailAt || 'None'}
Generated: ${new Date().toISOString()}
    `.trim();
  }

  /**
   * Get server uptime string
   */
  private getUptime(): string {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }

  /**
   * Schedule midnight reset
   */
  private scheduleMidnightReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.midnightResetTimer = setTimeout(async () => {
      await this.performDailyReset();
      this.scheduleMidnightReset();
    }, msUntilMidnight);

    console.log(`⏰ Daily reset scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
  }

  /**
   * Increment email count
   */
  async incrementCount(type: EmailType, provider: Provider): Promise<number> {
    this.checkAndResetIfNewDay();

    this.state.current.total++;
    this.state.current.byProvider[provider]++;
    this.state.current.byType[type]++;
    this.state.current.lastEmailAt = new Date().toISOString();

    this.saveState();
    await this.checkThresholds();

    return this.state.current.total;
  }

  /**
   * Record a failure
   */
  async recordFailure(type: EmailType, provider: Provider, error: Error, recipient?: string): Promise<void> {
    this.checkAndResetIfNewDay();

    this.state.current.failures++;
    this.saveState();

    // Alert via Telegram immediately
    await telegramAlertService.alertMailFailure(error, recipient || 'unknown', provider);
  }

  /**
   * Check thresholds and send warnings
   */
  private async checkThresholds(): Promise<void> {
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT || '100');
    const count = this.state.current.total;
    const percentUsed = (count / dailyLimit) * 100;

    if (percentUsed >= this.state.warnings.criticalCountThreshold) {
      await telegramAlertService.sendAlert({
        level: 'critical',
        category: 'Email Quota Critical',
        message: `Daily email quota nearly exhausted: ${count}/${dailyLimit}`,
        details: { currentCount: count, dailyLimit, percentUsed: Math.round(percentUsed) },
      });
    } else if (percentUsed >= this.state.warnings.highCountThreshold) {
      await telegramAlertService.alertHighEmailCount(count, dailyLimit);
    }
  }

  /**
   * Get current day's count
   */
  getTodayCount(): number {
    this.checkAndResetIfNewDay();
    return this.state.current.total;
  }

  /**
   * Get current day's stats
   */
  getTodayStats(): DailyStats {
    this.checkAndResetIfNewDay();
    return { ...this.state.current };
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    today: DailyStats;
    last7Days: { total: number; failures: number; avgPerDay: number };
    last30Days: { total: number; failures: number; avgPerDay: number };
  } {
    this.checkAndResetIfNewDay();

    const last7 = [this.state.current, ...this.state.history.slice(0, 6)];
    const last30 = [this.state.current, ...this.state.history.slice(0, 29)];

    const sum7 = last7.reduce((acc, d) => ({ total: acc.total + d.total, failures: acc.failures + d.failures }), { total: 0, failures: 0 });
    const sum30 = last30.reduce((acc, d) => ({ total: acc.total + d.total, failures: acc.failures + d.failures }), { total: 0, failures: 0 });

    return {
      today: this.getTodayStats(),
      last7Days: { total: sum7.total, failures: sum7.failures, avgPerDay: Math.round(sum7.total / Math.max(last7.length, 1)) },
      last30Days: { total: sum30.total, failures: sum30.failures, avgPerDay: Math.round(sum30.total / Math.max(last30.length, 1)) },
    };
  }

  /**
   * Manually trigger daily report (for testing)
   */
  async sendManualReport(): Promise<void> {
    await this.sendDailySummaryToAll(this.state.current);
  }

  /**
   * Clean up on shutdown
   */
  shutdown(): void {
    if (this.midnightResetTimer) {
      clearTimeout(this.midnightResetTimer);
    }
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      try {
        fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
      } catch (error) {
        console.error('Failed to save state on shutdown:', error);
      }
    }
    console.log('Email Counter Service shutdown complete');
  }
}

export const emailCounterService = new EmailCounterService();

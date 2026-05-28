/**
 * Telegram Alert Service
 * Sends immediate notifications for critical errors, mail failures, and system warnings
 */

import https from 'https';
import http from 'http';

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}

type AlertLevel = 'error' | 'warning' | 'info' | 'critical';

interface AlertPayload {
  level: AlertLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

class TelegramAlertService {
  private botToken: string | undefined;
  private chatId: string | undefined;
  private isConfigured: boolean = false;
  private lastAlertTime: Map<string, number> = new Map();
  private readonly RATE_LIMIT_MS = 60000; // 1 minute between duplicate alerts

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.isConfigured = !!(this.botToken && this.chatId);

    if (this.isConfigured) {
      console.log('✓ Telegram Alert Service configured');
    } else {
      console.warn('⚠ Telegram Alert Service not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
    }
  }

  /**
   * Check if service is properly configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Generate a unique key for rate limiting duplicate alerts
   */
  private getAlertKey(payload: AlertPayload): string {
    return `${payload.level}:${payload.category}:${payload.message}`;
  }

  /**
   * Check if we should rate limit this alert
   */
  private shouldRateLimit(payload: AlertPayload): boolean {
    const key = this.getAlertKey(payload);
    const lastTime = this.lastAlertTime.get(key);
    const now = Date.now();

    if (lastTime && (now - lastTime) < this.RATE_LIMIT_MS) {
      return true;
    }

    this.lastAlertTime.set(key, now);
    return false;
  }

  /**
   * Format alert message for Telegram
   */
  private formatMessage(payload: AlertPayload): string {
    const emoji = this.getLevelEmoji(payload.level);
    const timestamp = payload.timestamp || new Date().toISOString();

    let message = `${emoji} <b>${payload.level.toUpperCase()}</b> - ${payload.category}\n\n`;
    message += `<code>${payload.message}</code>\n\n`;

    if (payload.details && Object.keys(payload.details).length > 0) {
      message += `<b>Details:</b>\n`;
      for (const [key, value] of Object.entries(payload.details)) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        message += `  • ${key}: <code>${this.escapeHtml(valueStr)}</code>\n`;
      }
      message += '\n';
    }

    message += `<i>${timestamp}</i>`;

    return message;
  }

  /**
   * Get emoji for alert level
   */
  private getLevelEmoji(level: AlertLevel): string {
    switch (level) {
      case 'critical': return '🚨';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Send message to Telegram
   */
  private async sendTelegramMessage(text: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.warn('Telegram not configured, skipping alert');
      return false;
    }

    const payload: TelegramMessage = {
      chat_id: this.chatId!,
      text,
      parse_mode: 'HTML',
    };

    const postData = JSON.stringify(payload);
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            console.error(`Telegram API error: ${res.statusCode} - ${data}`);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.error('Telegram request error:', error.message);
        resolve(false);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Send an alert to Telegram
   */
  async sendAlert(payload: AlertPayload): Promise<boolean> {
    // Skip rate-limited alerts (except critical)
    if (payload.level !== 'critical' && this.shouldRateLimit(payload)) {
      console.log(`Rate limiting duplicate alert: ${payload.category} - ${payload.message}`);
      return false;
    }

    const message = this.formatMessage(payload);
    return this.sendTelegramMessage(message);
  }

  // Convenience methods for common alert types

  /**
   * Alert for mail delivery failures
   */
  async alertMailFailure(error: Error, recipient: string, provider: string): Promise<boolean> {
    return this.sendAlert({
      level: 'error',
      category: 'Mail Delivery Failed',
      message: error.message,
      details: {
        recipient: this.maskEmail(recipient),
        provider,
        errorName: error.name,
      },
    });
  }

  /**
   * Alert for mail service becoming unavailable
   */
  async alertMailServiceDown(provider: string, error: Error): Promise<boolean> {
    return this.sendAlert({
      level: 'critical',
      category: 'Mail Service Down',
      message: `${provider} is not responding`,
      details: {
        provider,
        error: error.message,
      },
    });
  }

  /**
   * Alert for database errors
   */
  async alertDatabaseError(operation: string, error: Error): Promise<boolean> {
    return this.sendAlert({
      level: 'error',
      category: 'Database Error',
      message: error.message,
      details: {
        operation,
        errorName: error.name,
      },
    });
  }

  /**
   * Alert for authentication issues
   */
  async alertAuthError(event: string, details: Record<string, unknown>): Promise<boolean> {
    return this.sendAlert({
      level: 'warning',
      category: 'Authentication Issue',
      message: event,
      details,
    });
  }

  /**
   * Alert for rate limiting triggered
   */
  async alertRateLimitExceeded(ip: string, endpoint: string): Promise<boolean> {
    return this.sendAlert({
      level: 'warning',
      category: 'Rate Limit Exceeded',
      message: `Rate limit triggered`,
      details: {
        ip: this.maskIp(ip),
        endpoint,
      },
    });
  }

  /**
   * Alert for high email count (approaching daily limit)
   */
  async alertHighEmailCount(count: number, limit: number): Promise<boolean> {
    return this.sendAlert({
      level: 'warning',
      category: 'Email Quota Warning',
      message: `Daily email count is high: ${count}/${limit}`,
      details: {
        currentCount: count,
        dailyLimit: limit,
        percentUsed: Math.round((count / limit) * 100),
      },
    });
  }

  /**
   * Alert for application errors logged
   */
  async alertApplicationError(category: string, error: Error, context?: Record<string, unknown>): Promise<boolean> {
    return this.sendAlert({
      level: 'error',
      category: `Application Error: ${category}`,
      message: error.message,
      details: {
        errorName: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join(' | '),
        ...context,
      },
    });
  }

  /**
   * Send daily status summary
   */
  async sendDailySummary(stats: {
    emailsSent: number;
    errors: number;
    warnings: number;
    uptime: string;
  }): Promise<boolean> {
    const message = `📊 <b>Daily Summary</b>\n\n` +
      `📧 Emails sent: <code>${stats.emailsSent}</code>\n` +
      `❌ Errors: <code>${stats.errors}</code>\n` +
      `⚠️ Warnings: <code>${stats.warnings}</code>\n` +
      `⏱️ Uptime: <code>${stats.uptime}</code>\n\n` +
      `<i>${new Date().toISOString()}</i>`;

    return this.sendTelegramMessage(message);
  }

  /**
   * Mask email for privacy in alerts
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    const maskedLocal = local.length > 2
      ? local[0] + '***' + local[local.length - 1]
      : '***';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Mask IP for privacy in alerts
   */
  private maskIp(ip: string): string {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    return ip.substring(0, Math.min(ip.length, 10)) + '...';
  }

  /**
   * Test the Telegram connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured) {
      console.warn('Telegram not configured');
      return false;
    }

    return this.sendAlert({
      level: 'info',
      category: 'System Test',
      message: 'Telegram alert service is working correctly',
      details: {
        service: 'A Formulation of Truth',
        status: 'operational',
      },
    });
  }
}

export const telegramAlertService = new TelegramAlertService();

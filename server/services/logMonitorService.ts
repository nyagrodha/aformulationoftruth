/**
 * Log Monitor Service
 * Watches log files for errors and critical events
 * Sends immediate Telegram alerts when issues are detected
 */

import fs from 'fs';
import path from 'path';
import { telegramAlertService } from './telegramAlertService';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  category?: string;
  event?: string;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  [key: string]: unknown;
}

interface MonitorConfig {
  logDir: string;
  errorLogFile: string;
  combinedLogFile: string;
  authLogFile: string;
  checkIntervalMs: number;
  alertCooldownMs: number;
}

class LogMonitorService {
  private config: MonitorConfig;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastCheckedPositions: Map<string, number> = new Map();
  private alertedErrors: Map<string, number> = new Map();
  private errorCounts: { [key: string]: number } = {};

  constructor() {
    this.config = {
      logDir: process.env.LOG_DIR || '/var/log/aformulationoftruth',
      errorLogFile: 'error.log',
      combinedLogFile: 'combined.log',
      authLogFile: 'auth.log',
      checkIntervalMs: parseInt(process.env.LOG_CHECK_INTERVAL_MS || '30000'), // 30 seconds
      alertCooldownMs: parseInt(process.env.LOG_ALERT_COOLDOWN_MS || '300000'), // 5 minutes
    };

    console.log(`✓ Log Monitor Service initialized (checking ${this.config.logDir})`);
  }

  /**
   * Start the log monitoring service
   */
  start(): void {
    if (this.isRunning) {
      console.log('Log monitor already running');
      return;
    }

    this.isRunning = true;

    // Initialize file positions to current end (don't process old logs on startup)
    this.initializeFilePositions();

    // Start periodic checking
    this.checkInterval = setInterval(() => {
      this.checkLogs().catch(err => {
        console.error('Error in log check:', err);
      });
    }, this.config.checkIntervalMs);

    console.log(`📋 Log Monitor Service started (interval: ${this.config.checkIntervalMs}ms)`);
  }

  /**
   * Stop the log monitoring service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('Log Monitor Service stopped');
  }

  /**
   * Initialize file positions to end of files
   */
  private initializeFilePositions(): void {
    const files = [
      this.config.errorLogFile,
      this.config.combinedLogFile,
      this.config.authLogFile,
    ];

    for (const file of files) {
      const filePath = path.join(this.config.logDir, file);
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          this.lastCheckedPositions.set(file, stats.size);
        } else {
          this.lastCheckedPositions.set(file, 0);
        }
      } catch (error) {
        this.lastCheckedPositions.set(file, 0);
      }
    }
  }

  /**
   * Check logs for new errors
   */
  private async checkLogs(): Promise<void> {
    // Primarily monitor error.log for critical issues
    await this.checkLogFile(this.config.errorLogFile, 'error');

    // Also check auth.log for security events
    await this.checkLogFile(this.config.authLogFile, 'auth');
  }

  /**
   * Check a specific log file for new entries
   */
  private async checkLogFile(fileName: string, category: string): Promise<void> {
    const filePath = path.join(this.config.logDir, fileName);

    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      const lastPosition = this.lastCheckedPositions.get(fileName) || 0;

      // Check if file was rotated (size smaller than last position)
      if (stats.size < lastPosition) {
        this.lastCheckedPositions.set(fileName, 0);
        return;
      }

      // No new data
      if (stats.size === lastPosition) {
        return;
      }

      // Read new content
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stats.size - lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
      fs.closeSync(fd);

      // Update position
      this.lastCheckedPositions.set(fileName, stats.size);

      // Process new lines
      const newContent = buffer.toString('utf8');
      const lines = newContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        await this.processLogLine(line, category);
      }
    } catch (error) {
      console.error(`Error reading log file ${fileName}:`, error);
    }
  }

  /**
   * Process a log line and potentially send alerts
   */
  private async processLogLine(line: string, category: string): Promise<void> {
    try {
      // Try to parse as JSON (Winston format)
      const entry = JSON.parse(line) as LogEntry;
      await this.handleLogEntry(entry, category);
    } catch {
      // Not JSON, try to extract error info from plain text
      if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
        await this.handlePlainTextError(line, category);
      }
    }
  }

  /**
   * Handle a parsed log entry
   */
  private async handleLogEntry(entry: LogEntry, category: string): Promise<void> {
    const level = entry.level?.toLowerCase() || '';

    // Track error counts
    if (level === 'error' || level === 'fatal' || level === 'crit') {
      const errorKey = `${category}:${entry.event || 'unknown'}`;
      this.errorCounts[errorKey] = (this.errorCounts[errorKey] || 0) + 1;

      // Check if we should alert
      if (this.shouldAlert(entry)) {
        await this.sendErrorAlert(entry, category);
      }
    }

    // Special handling for auth failures (potential brute force)
    if (category === 'auth' && entry.event === 'failure') {
      await this.handleAuthFailure(entry);
    }
  }

  /**
   * Handle plain text error
   */
  private async handlePlainTextError(line: string, category: string): Promise<void> {
    const errorKey = `plaintext:${category}:${line.substring(0, 50)}`;

    if (this.shouldAlertByKey(errorKey)) {
      await telegramAlertService.sendAlert({
        level: 'error',
        category: `Log Error (${category})`,
        message: line.substring(0, 200),
        details: {
          source: category,
          type: 'plaintext',
        },
      });
    }
  }

  /**
   * Check if we should send an alert for this entry
   */
  private shouldAlert(entry: LogEntry): boolean {
    const errorKey = this.getErrorKey(entry);
    return this.shouldAlertByKey(errorKey);
  }

  /**
   * Check if we should send an alert based on key and cooldown
   */
  private shouldAlertByKey(errorKey: string): boolean {
    const lastAlerted = this.alertedErrors.get(errorKey);
    const now = Date.now();

    if (lastAlerted && (now - lastAlerted) < this.config.alertCooldownMs) {
      return false;
    }

    this.alertedErrors.set(errorKey, now);
    return true;
  }

  /**
   * Generate a unique key for deduplication
   */
  private getErrorKey(entry: LogEntry): string {
    const parts = [
      entry.category || 'unknown',
      entry.event || 'unknown',
      entry.error?.name || '',
      entry.error?.message?.substring(0, 50) || entry.message?.substring(0, 50) || '',
    ];
    return parts.join(':');
  }

  /**
   * Send error alert via Telegram
   */
  private async sendErrorAlert(entry: LogEntry, category: string): Promise<void> {
    await telegramAlertService.sendAlert({
      level: 'error',
      category: `Log: ${entry.category || category}`,
      message: entry.error?.message || entry.message,
      details: {
        event: entry.event,
        errorName: entry.error?.name,
        timestamp: entry.timestamp,
        stack: entry.error?.stack?.split('\n').slice(0, 2).join(' | '),
      },
    });
  }

  /**
   * Handle authentication failure (potential security issue)
   */
  private async handleAuthFailure(entry: LogEntry): Promise<void> {
    // Track failures by identifier (could be IP or email hash)
    const identifier = String(entry['userAgentHash'] || entry['ipHash'] || 'unknown');
    const failureKey = `auth_failure:${identifier}`;

    const failureCount = (this.errorCounts[failureKey] || 0) + 1;
    this.errorCounts[failureKey] = failureCount;

    // Alert on suspicious patterns (multiple failures)
    if (failureCount === 5 || failureCount === 10 || failureCount === 20) {
      await telegramAlertService.sendAlert({
        level: failureCount >= 20 ? 'critical' : 'warning',
        category: 'Potential Brute Force',
        message: `Multiple authentication failures detected`,
        details: {
          failureCount,
          identifier: identifier.substring(0, 12) + '...',
          event: entry.event,
        },
      });
    }
  }

  /**
   * Get current error statistics
   */
  getStats(): { errorCounts: { [key: string]: number }; alertedErrors: number } {
    return {
      errorCounts: { ...this.errorCounts },
      alertedErrors: this.alertedErrors.size,
    };
  }

  /**
   * Reset error counts (called daily)
   */
  resetDailyStats(): void {
    this.errorCounts = {};
    // Clean up old alerts (older than cooldown)
    const now = Date.now();
    for (const [key, time] of this.alertedErrors.entries()) {
      if (now - time > this.config.alertCooldownMs * 2) {
        this.alertedErrors.delete(key);
      }
    }
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export const logMonitorService = new LogMonitorService();

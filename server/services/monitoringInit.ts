/**
 * Monitoring Services Initializer
 * Initializes and manages all monitoring services:
 * - Telegram Alert Service
 * - Email Counter Service
 * - Log Monitor Service
 */

import { telegramAlertService } from './telegramAlertService';
import { emailCounterService } from './emailCounterService';
import { logMonitorService } from './logMonitorService';

class MonitoringServices {
  private isInitialized: boolean = false;

  /**
   * Initialize all monitoring services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Monitoring services already initialized');
      return;
    }

    console.log('\n🔧 Initializing Monitoring Services...\n');

    // Telegram is initialized on import (constructor)
    if (telegramAlertService.isReady()) {
      console.log('  ✓ Telegram Alert Service: Ready');
    } else {
      console.log('  ⚠ Telegram Alert Service: Not configured');
    }

    // Email counter is initialized on import (constructor)
    console.log(`  ✓ Email Counter Service: ${emailCounterService.getTodayCount()} emails today`);

    // Start log monitoring
    logMonitorService.start();
    console.log('  ✓ Log Monitor Service: Started');

    this.isInitialized = true;

    // Send startup notification
    if (telegramAlertService.isReady()) {
      await telegramAlertService.sendAlert({
        level: 'info',
        category: 'System Startup',
        message: 'A Formulation of Truth backend started',
        details: {
          emailsToday: emailCounterService.getTodayCount(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      });
    }

    console.log('\n✅ Monitoring Services initialized successfully\n');
  }

  /**
   * Shutdown all monitoring services gracefully
   */
  async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down Monitoring Services...\n');

    // Stop log monitoring
    logMonitorService.stop();
    console.log('  ✓ Log Monitor Service stopped');

    // Save email counter state
    emailCounterService.shutdown();
    console.log('  ✓ Email Counter Service state saved');

    // Send shutdown notification
    if (telegramAlertService.isReady()) {
      await telegramAlertService.sendAlert({
        level: 'info',
        category: 'System Shutdown',
        message: 'A Formulation of Truth backend stopped',
        details: {
          emailsSentToday: emailCounterService.getTodayCount(),
          uptime: this.getUptime(),
        },
      });
    }

    this.isInitialized = false;
    console.log('\n✅ Monitoring Services shutdown complete\n');
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
   * Get health status of all monitoring services
   */
  getHealthStatus(): {
    telegram: { configured: boolean };
    emailCounter: { todayCount: number; todayFailures: number };
    logMonitor: { active: boolean; errorCounts: { [key: string]: number } };
  } {
    return {
      telegram: {
        configured: telegramAlertService.isReady(),
      },
      emailCounter: {
        todayCount: emailCounterService.getTodayCount(),
        todayFailures: emailCounterService.getTodayStats().failures,
      },
      logMonitor: {
        active: logMonitorService.isActive(),
        errorCounts: logMonitorService.getStats().errorCounts,
      },
    };
  }

  /**
   * Test Telegram connection
   */
  async testTelegram(): Promise<boolean> {
    return telegramAlertService.testConnection();
  }

  /**
   * Send manual daily report
   */
  async sendManualReport(): Promise<void> {
    await emailCounterService.sendManualReport();
  }

  /**
   * Get email statistics summary
   */
  getEmailStats() {
    return emailCounterService.getSummary();
  }
}

export const monitoringServices = new MonitoringServices();

// Export individual services for direct access
export { telegramAlertService, emailCounterService, logMonitorService };

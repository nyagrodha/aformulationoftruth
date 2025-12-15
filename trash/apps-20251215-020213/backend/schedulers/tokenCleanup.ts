/**
 * Token Cleanup Scheduler
 *
 * Periodic cleanup of expired magic link tokens
 */

import { Client } from 'pg';
import { cleanupExpiredTokens } from '../utils/db.js';

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Start periodic token cleanup
 */
export function startTokenCleanup(client: Client): NodeJS.Timeout {
  console.log('🔄 Starting token cleanup scheduler (runs every hour)');

  const intervalId = setInterval(async () => {
    try {
      await cleanupExpiredTokens();
      console.log('✅ Token cleanup completed');
    } catch (error) {
      console.error('❌ Error during token cleanup:', error);
    }
  }, CLEANUP_INTERVAL);

  // Run cleanup immediately on startup
  cleanupExpiredTokens().catch(error => {
    console.error('❌ Initial token cleanup failed:', error);
  });

  return intervalId;
}

/**
 * Stop token cleanup scheduler
 */
export function stopTokenCleanup(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  console.log('✅ Token cleanup scheduler stopped');
}

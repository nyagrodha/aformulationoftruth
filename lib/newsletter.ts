/**
 * Newsletter Service - Double Opt-in Implementation
 *
 * gupta-vidya compliance:
 * - Email immediately hashed for storage (SHA-256)
 * - Confirmation tokens are one-time use
 * - Unsubscribe tokens are permanent (no login required)
 * - No plaintext emails stored
 *
 * Uses: newsletter_subscribers table (consolidated from legacy tables)
 */

import { withConnection } from './db.ts';
import { hashEmail } from './crypto.ts';

const CONFIRMATION_EXPIRY_HOURS = 24;
const TABLE_NAME = 'newsletter_subscribers';

interface SubscribeResult {
  success: boolean;
  status: 'new' | 'pending' | 'already_confirmed' | 'resubscribed';
  confirmationToken?: string;
  unsubscribeToken?: string;
}

interface ConfirmResult {
  success: boolean;
  status: 'confirmed' | 'expired' | 'invalid' | 'already_confirmed';
}

interface UnsubscribeResult {
  success: boolean;
  status: 'unsubscribed' | 'invalid' | 'already_unsubscribed';
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a token for secure storage
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Subscribe an email to the newsletter (creates pending subscription)
 */
export async function subscribeEmail(email: string): Promise<SubscribeResult> {
  const emailHash = await hashEmail(email);
  const confirmationToken = generateToken();
  const confirmationTokenHash = await hashToken(confirmationToken);
  const unsubscribeToken = generateToken();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CONFIRMATION_EXPIRY_HOURS);

  return await withConnection(async (client) => {
    // Check if email already exists
    const existing = await client.queryObject<{
      id: string;
      status: string;
      unsubscribe_token: string;
    }>(
      `SELECT id, status, unsubscribe_token FROM newsletter_subscribers WHERE email_hash = $1`,
      [emailHash]
    );

    if (existing.rows.length > 0) {
      const subscriber = existing.rows[0];

      if (subscriber.status === 'confirmed') {
        return {
          success: true,
          status: 'already_confirmed' as const,
        };
      }

      if (subscriber.status === 'unsubscribed') {
        // Resubscribe - update with new confirmation token
        await client.queryObject(
          `UPDATE newsletter_subscribers
           SET status = 'pending',
               confirmation_token_hash = $1,
               confirmation_expires_at = $2,
               unsubscribed_at = NULL
           WHERE id = $3`,
          [confirmationTokenHash, expiresAt, subscriber.id]
        );

        return {
          success: true,
          status: 'resubscribed' as const,
          confirmationToken,
          unsubscribeToken: subscriber.unsubscribe_token,
        };
      }

      // Still pending - update confirmation token
      await client.queryObject(
        `UPDATE newsletter_subscribers
         SET confirmation_token_hash = $1,
             confirmation_expires_at = $2
         WHERE id = $3`,
        [confirmationTokenHash, expiresAt, subscriber.id]
      );

      return {
        success: true,
        status: 'pending' as const,
        confirmationToken,
        unsubscribeToken: subscriber.unsubscribe_token,
      };
    }

    // New subscriber
    const result = await client.queryObject<{ unsubscribe_token: string }>(
      `INSERT INTO newsletter_subscribers (email_hash, confirmation_token_hash, confirmation_expires_at, unsubscribe_token)
       VALUES ($1, $2, $3, $4)
       RETURNING unsubscribe_token`,
      [emailHash, confirmationTokenHash, expiresAt, unsubscribeToken]
    );

    return {
      success: true,
      status: 'new' as const,
      confirmationToken,
      unsubscribeToken: result.rows[0].unsubscribe_token,
    };
  });
}

/**
 * Confirm a newsletter subscription
 */
export async function confirmSubscription(token: string): Promise<ConfirmResult> {
  const tokenHash = await hashToken(token);

  return await withConnection(async (client) => {
    const result = await client.queryObject<{
      id: string;
      status: string;
      confirmation_expires_at: Date;
    }>(
      `SELECT id, status, confirmation_expires_at
       FROM newsletter_subscribers
       WHERE confirmation_token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 'invalid' as const };
    }

    const subscriber = result.rows[0];

    if (subscriber.status === 'confirmed') {
      return { success: true, status: 'already_confirmed' as const };
    }

    if (new Date() > new Date(subscriber.confirmation_expires_at)) {
      return { success: false, status: 'expired' as const };
    }

    // Confirm the subscription
    await client.queryObject(
      `UPDATE newsletter_subscribers
       SET status = 'confirmed',
           confirmed_at = NOW(),
           confirmation_token_hash = NULL,
           confirmation_expires_at = NULL
       WHERE id = $1`,
      [subscriber.id]
    );

    return { success: true, status: 'confirmed' as const };
  });
}

/**
 * Unsubscribe from the newsletter
 */
export async function unsubscribeEmail(token: string): Promise<UnsubscribeResult> {
  return await withConnection(async (client) => {
    const result = await client.queryObject<{ id: string; status: string }>(
      `SELECT id, status FROM newsletter_subscribers WHERE unsubscribe_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 'invalid' as const };
    }

    const subscriber = result.rows[0];

    if (subscriber.status === 'unsubscribed') {
      return { success: true, status: 'already_unsubscribed' as const };
    }

    await client.queryObject(
      `UPDATE newsletter_subscribers
       SET status = 'unsubscribed',
           unsubscribed_at = NOW()
       WHERE id = $1`,
      [subscriber.id]
    );

    return { success: true, status: 'unsubscribed' as const };
  });
}

/**
 * Get subscriber count (for admin/stats)
 */
export async function getSubscriberCount(): Promise<{ total: number; confirmed: number; pending: number }> {
  return await withConnection(async (client) => {
    const result = await client.queryObject<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM newsletter_subscribers GROUP BY status`
    );

    const counts = { total: 0, confirmed: 0, pending: 0 };
    for (const row of result.rows) {
      const count = parseInt(row.count);
      counts.total += count;
      if (row.status === 'confirmed') counts.confirmed = count;
      if (row.status === 'pending') counts.pending = count;
    }

    return counts;
  });
}

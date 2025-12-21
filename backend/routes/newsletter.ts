/**
 * Newsletter Subscription API Routes
 * Handles encrypted email subscription for newsletter updates
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { Client } from 'pg';
import { encryptData, hashEmail, generateSubscriptionId } from '../utils-src/newsletter-crypto.js';

const router = express.Router();
let dbClient: Client;

/**
 * Set database client
 * @param client PostgreSQL client instance
 */
export function setDatabaseClient(client: Client): void {
  dbClient = client;
}

/**
 * Validate email format
 * @param email Email address to validate
 * @returns true if valid email format
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate unique unsubscribe token
 * @returns Random hex string
 */
function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/newsletter/subscribe
 * Subscribe an email to the newsletter with encryption
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Validate email format
    if (!validateEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address format'
      });
    }

    if (!dbClient) {
      throw new Error('Database client not available');
    }

    // Check for existing subscription using hash (privacy-preserving duplicate check)
    const emailHash = hashEmail(normalizedEmail);
    const existingCheck = await dbClient.query(
      `SELECT id, subscribed FROM newsletter_emails
       WHERE encode(digest(encrypted_email, 'sha256'), 'hex') = $1`,
      [emailHash]
    );

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      if (existing.subscribed) {
        return res.status(200).json({
          success: true,
          message: 'Email already subscribed',
          alreadySubscribed: true
        });
      } else {
        // Re-subscribe previously unsubscribed email
        await dbClient.query(
          `UPDATE newsletter_emails
           SET subscribed = true, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [existing.id]
        );
        return res.status(200).json({
          success: true,
          message: 'Successfully re-subscribed to newsletter',
          alreadySubscribed: false
        });
      }
    }

    // Encrypt the email using AES-256-GCM
    const { encrypted, iv } = encryptData(normalizedEmail);

    // Extract authentication tag (last 16 bytes)
    const tag = encrypted.subarray(encrypted.length - 16);
    const encryptedEmail = encrypted.subarray(0, encrypted.length - 16);

    // Generate unique unsubscribe token
    const unsubscribeToken = generateUnsubscribeToken();

    // Insert encrypted email into database
    await dbClient.query(
      `INSERT INTO newsletter_emails (encrypted_email, iv, tag, unsubscribe_token, subscribed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        encryptedEmail.toString('base64'),
        iv.toString('base64'),
        tag.toString('base64'),
        unsubscribeToken,
        true
      ]
    );

    console.log(`[Newsletter] New subscription from IP: ${req.ip || 'unknown'}`);

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to newsletter',
      alreadySubscribed: false
    });

  } catch (error: any) {
    console.error('[Newsletter Subscribe Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe. Please try again later.'
    });
  }
});

/**
 * GET /api/newsletter/count
 * Get total number of active subscribers (admin endpoint)
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    if (!dbClient) {
      throw new Error('Database client not available');
    }

    const result = await dbClient.query(
      `SELECT COUNT(*) as total FROM newsletter_emails WHERE subscribed = true`
    );

    res.json({
      success: true,
      count: parseInt(result.rows[0].total)
    });

  } catch (error: any) {
    console.error('[Newsletter Count Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscriber count'
    });
  }
});

/**
 * POST /api/newsletter/unsubscribe
 * Unsubscribe an email using the unsubscribe token
 */
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Unsubscribe token is required'
      });
    }

    if (!dbClient) {
      throw new Error('Database client not available');
    }

    const result = await dbClient.query(
      `UPDATE newsletter_emails
       SET subscribed = false, updated_at = CURRENT_TIMESTAMP
       WHERE unsubscribe_token = $1 AND subscribed = true
       RETURNING id`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid token or already unsubscribed'
      });
    }

    console.log(`[Newsletter] Unsubscribed email from IP: ${req.ip || 'unknown'}`);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    });

  } catch (error: any) {
    console.error('[Newsletter Unsubscribe Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe. Please try again later.'
    });
  }
});

export default router;

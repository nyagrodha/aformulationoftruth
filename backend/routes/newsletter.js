// routes/newsletter.js
// Email subscription endpoint with encryption support
import express from 'express';
import { encryptEmail, decryptEmail, validateEmail } from '../utils/encryption.js';

const router = express.Router();

/**
 * POST /api/newsletter/subscribe
 * Subscribe an email to the newsletter with encryption
 * Body: { email: string }
 * Returns: { success: boolean, message: string }
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address format'
      });
    }

    // Get database client from request (injected by middleware)
    const client = req.app.locals.dbClient;
    if (!client) {
      throw new Error('Database client not available');
    }

    // Encrypt the email
    const encryptedEmail = encryptEmail(email);

    // Check if email already exists (we check encrypted values)
    const existingCheck = await client.query(
      'SELECT id FROM newsletter_subscribers WHERE encrypted_email = $1',
      [encryptedEmail]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Email already subscribed',
        alreadySubscribed: true
      });
    }

    // Insert encrypted email into database
    await client.query(
      `INSERT INTO newsletter_subscribers (encrypted_email, subscribed_at, ip_address)
       VALUES ($1, NOW(), $2)`,
      [encryptedEmail, req.ip || req.connection.remoteAddress]
    );

    console.log(`[Newsletter] New subscription from IP: ${req.ip}`);

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to newsletter',
      alreadySubscribed: false
    });

  } catch (error) {
    console.error('[Newsletter Subscribe Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe. Please try again later.'
    });
  }
});

/**
 * GET /api/newsletter/count
 * Get total number of subscribers (admin endpoint)
 */
router.get('/count', async (req, res) => {
  try {
    const client = req.app.locals.dbClient;

    const result = await client.query(
      'SELECT COUNT(*) as total FROM newsletter_subscribers WHERE unsubscribed_at IS NULL'
    );

    res.json({
      success: true,
      count: parseInt(result.rows[0].total)
    });

  } catch (error) {
    console.error('[Newsletter Count Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscriber count'
    });
  }
});

/**
 * POST /api/newsletter/unsubscribe
 * Unsubscribe an email (requires token or email)
 * Body: { email: string } or { token: string }
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const client = req.app.locals.dbClient;
    const encryptedEmail = encryptEmail(email);

    const result = await client.query(
      `UPDATE newsletter_subscribers
       SET unsubscribed_at = NOW()
       WHERE encrypted_email = $1 AND unsubscribed_at IS NULL
       RETURNING id`,
      [encryptedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Email not found or already unsubscribed'
      });
    }

    console.log(`[Newsletter] Unsubscribed email from IP: ${req.ip}`);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    });

  } catch (error) {
    console.error('[Newsletter Unsubscribe Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe. Please try again later.'
    });
  }
});

export default router;

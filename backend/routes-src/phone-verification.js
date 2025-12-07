import express from 'express';
import { generateVerificationCode, sendVerificationSMS, sendVerificationCall, normalizePhoneNumber } from '../utils/sms.js';

const router = express.Router();

// PostgreSQL client - will be set by server.js
let dbClient = null;

export function setDatabaseClient(client) {
  dbClient = client;
}

// Rate limiting: max 5 verification attempts per hour per IP
const rateLimitMap = new Map();

function checkRateLimit(ipAddress) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  if (!rateLimitMap.has(ipAddress)) {
    rateLimitMap.set(ipAddress, []);
  }

  const attempts = rateLimitMap.get(ipAddress).filter(timestamp => timestamp > hourAgo);

  if (attempts.length >= 5) {
    return false;
  }

  attempts.push(now);
  rateLimitMap.set(ipAddress, attempts);
  return true;
}

// POST /api/phone/request - Request verification code
router.post('/request', async (req, res) => {
  const { phoneNumber, method = 'sms', email } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email required for verification' });
  }

  try {
    // Normalize phone number to E.164 format
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Get client IP address
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Check rate limit
    if (!checkRateLimit(ipAddress)) {
      return res.status(429).json({
        error: 'Too many verification attempts. Please try again in an hour.'
      });
    }

    // Check if user exists with this email
    const userResult = await dbClient.query(
      'SELECT id, phone_number, phone_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please complete email verification first.' });
    }

    const user = userResult.rows[0];

    // Check if phone number is already verified by another user
    if (!user.phone_verified) {
      const duplicateCheck = await dbClient.query(
        'SELECT id FROM users WHERE phone_number = $1 AND phone_verified = true AND id != $2',
        [normalizedPhone, user.id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'This phone number is already verified by another account'
        });
      }
    }

    // Generate 6-digit verification code
    const code = generateVerificationCode();

    // Store in database with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await dbClient.query(
      `INSERT INTO phone_verification_codes
       (user_id, phone_number, code, expires_at, verified, attempts, created_at)
       VALUES ($1, $2, $3, $4, false, 0, NOW())`,
      [user.id, normalizedPhone, code, expiresAt]
    );

    // Send verification code
    let result;
    if (method === 'voice') {
      result = await sendVerificationCall(normalizedPhone, code);
    } else {
      result = await sendVerificationSMS(normalizedPhone, code);
    }

    console.log(`✓ Verification ${method} sent to ${normalizedPhone} for ${email}`);

    res.json({
      message: `Verification code sent via ${method}`,
      phoneNumber: normalizedPhone,
      expiresIn: 600, // 10 minutes in seconds
      testMode: result.testMode || false
    });

  } catch (error) {
    console.error('Error sending verification code:', error);

    if (error.message.includes('Invalid phone number')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// POST /api/phone/verify - Verify the code
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code required' });
  }

  try {
    // Get user
    const userResult = await dbClient.query(
      'SELECT id, phone_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Find the most recent unverified code for this user
    const codeResult = await dbClient.query(
      `SELECT id, phone_number, code, expires_at, verified, attempts
       FROM phone_verification_codes
       WHERE user_id = $1 AND verified = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (codeResult.rows.length === 0) {
      return res.status(404).json({ error: 'No verification code found. Please request a new code.' });
    }

    const verification = codeResult.rows[0];

    // Check if code has expired
    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    // Check if too many attempts
    if (verification.attempts >= 3) {
      return res.status(400).json({
        error: 'Too many failed attempts. Please request a new code.'
      });
    }

    // Verify the code
    if (verification.code !== code) {
      // Increment attempt counter
      await dbClient.query(
        'UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE id = $1',
        [verification.id]
      );

      const attemptsLeft = 3 - (verification.attempts + 1);
      return res.status(400).json({
        error: 'Invalid verification code',
        attemptsLeft: attemptsLeft
      });
    }

    // Code is valid - update user and mark code as verified
    await dbClient.query('BEGIN');

    try {
      // Update user
      await dbClient.query(
        `UPDATE users
         SET phone_number = $1, phone_verified = true, phone_verified_at = NOW()
         WHERE id = $2`,
        [verification.phone_number, user.id]
      );

      // Mark code as verified
      await dbClient.query(
        'UPDATE phone_verification_codes SET verified = true WHERE id = $1',
        [verification.id]
      );

      await dbClient.query('COMMIT');

      console.log(`✓ Phone verified for ${email}: ${verification.phone_number}`);

      res.json({
        message: 'Phone number verified successfully',
        phoneNumber: verification.phone_number,
        verified: true
      });

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error verifying phone:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// GET /api/phone/status - Check phone verification status
router.get('/status', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await dbClient.query(
      'SELECT phone_number, phone_verified, phone_verified_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      phoneNumber: user.phone_number,
      phoneVerified: user.phone_verified || false,
      phoneVerifiedAt: user.phone_verified_at
    });

  } catch (error) {
    console.error('Error checking phone status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;

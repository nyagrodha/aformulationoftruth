import express from 'express';
// Use SQLite for magic link tokens (PostgreSQL not required)
import { generateToken, saveMagicLinkToken, findMagicLinkToken, deleteMagicLinkToken } from '../utils/db-sqlite.js';
import { sendMagicLinkEmail } from '../utils/mailer.js';
import { Client } from 'pg';
import { getCachedIPInfo } from '../utils/ip-lookup.js';
import { saveIPGeolocation, recordUserIPAccess, updateUserCurrentIP, isIPRegistered } from '../utils/ip-geolocation.js';
import { encryptGeolocation } from '../utils/crypto.js';

const router = express.Router();

// PostgreSQL client - will be set by server.js
let dbClient = null;

export function setDatabaseClient(client) {
  dbClient = client;
}

router.post('/request', async (req, res) => {
  const { email, geolocation } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  try {
    // Get client IP address
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Admin email - bypasses IP restriction
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'marcel@aformulationoftruth.com';
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Look up IP geolocation data
    let ipData = null;
    let ipId = null;

    if (dbClient) {
      ipData = await getCachedIPInfo(ipAddress);

      if (ipData) {
        // Save IP geolocation to database
        ipId = await saveIPGeolocation(dbClient, ipData);

        // Log privacy tool usage (informational only - we don't block)
        if (ipData.is_tor) {
          console.log(`ℹ️ Tor user: ${email} from ${ipAddress}`);
        }
        if (ipData.is_vpn) {
          console.log(`ℹ️ VPN user: ${email} from ${ipAddress}`);
        }
        if (ipData.is_proxy) {
          console.log(`ℹ️ Proxy user: ${email} from ${ipAddress}`);
        }
      }

      // Check if this IP already has a registered user (unless admin)
      // ⚠️ IMPORTANT: We track but DO NOT block VPN/Tor users!
      if (!isAdmin) {
        const ipRegistered = await isIPRegistered(dbClient, ipAddress, email);

        if (ipRegistered) {
          return res.status(403).json({
            error: 'A user from the same IP logged in with another email. Please contact Karuppacami if you believe this to be in error: nirvikalpasamadhi@aformulationoftruth.com'
          });
        }
      }
    }

    // 1. Generate cryptographically secure token
    const token = generateToken();

    // 2. Save token + email + expiry (10min) in DB
    await saveMagicLinkToken(email, token);

    // 3. Send email with magic link
    await sendMagicLinkEmail(email, token);

    // 4. Store encrypted geolocation if provided (temporary storage keyed by token)
    // Will be saved to database when user verifies their email
    if (geolocation && dbClient) {
      try {
        // Temporarily store geolocation data with the token
        // This will be encrypted and saved when the user clicks the magic link
        await saveMagicLinkToken(email, token, geolocation);
      } catch (geoError) {
        console.error('Failed to store geolocation with token:', geoError);
        // Continue anyway - geolocation is optional
      }
    }

    const locationStr = ipData ? ` from ${ipData.city || 'Unknown'}, ${ipData.country || 'Unknown'}` : '';
    const geoStr = geolocation ? ' (GPS collected)' : '';
    console.log(`Magic link sent to ${email}${isAdmin ? ' (ADMIN)' : ''}${locationStr}${geoStr} (IP: ${ipAddress})`);
    res.json({ message: 'Magic link sent! Check your email inbox.' });
  } catch (error) {
    console.error('Error sending magic link:', error);
    res.status(500).json({ error: 'Failed to send magic link. Please try again.' });
  }
});

router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  try {
    const record = await findMagicLinkToken(token);
    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    // Token valid – delete it for one-time use
    await deleteMagicLinkToken(token);

    // Get client IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || null;

    // Admin email - gets admin flag set
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'marcel@aformulationoftruth.com';
    const isAdmin = record.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Look up and save IP geolocation data
    let ipData = null;
    let ipId = null;

    if (dbClient) {
      ipData = await getCachedIPInfo(ipAddress);

      if (ipData) {
        ipId = await saveIPGeolocation(dbClient, ipData);
      }
    }

    // Create or update user in PostgreSQL database
    let userId = null;
    if (dbClient) {
      try {
        // Check if user exists
        const existingUser = await dbClient.query(
          'SELECT id, email FROM users WHERE email = $1',
          [record.email]
        );

        if (existingUser.rows.length === 0) {
          // Create new user with email authentication
          const result = await dbClient.query(
            `INSERT INTO users (username, email, password_hash, public_key, last_login, ip_address, is_admin, auth_method, current_ip_id)
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
             RETURNING id`,
            [
              record.email.split('@')[0], // username from email prefix
              record.email,
              'magic-link-auth', // placeholder for password_hash
              'email-auth', // placeholder for public_key
              ipAddress, // IP address
              isAdmin, // admin flag
              'magic-link', // auth method
              ipId // current IP geolocation ID
            ]
          );
          userId = result.rows[0].id;

          const locationStr = ipData ? ` from ${ipData.city || 'Unknown'}, ${ipData.country || 'Unknown'}` : '';
          console.log(`✓ Created user record for ${record.email}${isAdmin ? ' (ADMIN)' : ''}${locationStr}`);

          // Record IP access history
          if (ipId) {
            await recordUserIPAccess(dbClient, userId, ipId, userAgent, 'register');
          }
        } else {
          // Update last login and IP for existing user
          userId = existingUser.rows[0].id;

          await dbClient.query(
            'UPDATE users SET last_login = NOW(), ip_address = $1, auth_method = $2, current_ip_id = $3 WHERE email = $4',
            [ipAddress, 'magic-link', ipId, record.email]
          );

          const locationStr = ipData ? ` from ${ipData.city || 'Unknown'}, ${ipData.country || 'Unknown'}` : '';
          console.log(`✓ Updated last_login for ${record.email}${locationStr}`);

          // Record IP access history
          if (ipId) {
            await recordUserIPAccess(dbClient, userId, ipId, userAgent, 'login');
          }
        }
      } catch (dbError) {
        console.error('Database error during user creation:', dbError);
        // Continue anyway - user can still access with JWT
      }
    }

    // Generate JWT session token (12-hour expiration)
    const jwt = await import('jsonwebtoken');
    const issuedAt = Math.floor(Date.now() / 1000);
    const sessionToken = jwt.default.sign(
      {
        email: record.email,
        iat: issuedAt,
        userId: userId
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '12h' }
    );

    // Encrypt and save user's geolocation if provided
    if (record.geolocation && userId && dbClient) {
      try {
        const encryptedGeo = encryptGeolocation(record.geolocation, sessionToken);

        await dbClient.query(
          `INSERT INTO user_geolocation (user_id, encrypted_data, accuracy, source)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            encryptedGeo,
            record.geolocation.accuracy || null,
            'browser'
          ]
        );

        console.log(`✓ Saved encrypted geolocation for user ${userId}`);
      } catch (geoError) {
        console.error('Failed to save encrypted geolocation:', geoError);
        // Continue anyway - geolocation is optional
      }
    }

    // Redirect to questionnaire with session token
    res.redirect(`/questions?auth=success&token=${sessionToken}&email=${encodeURIComponent(record.email)}`);
  } catch (error) {
    console.error('Error verifying magic link:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

export default router;

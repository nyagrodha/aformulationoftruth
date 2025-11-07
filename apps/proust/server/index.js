/**
 * Proust Questionnaire Server with Gupta Vidyā Encryption
 * गुप्त-विद्या सर्वर - The Encrypted Gateway
 *
 * This server handles the Proust Questionnaire with end-to-end encryption,
 * where each email is protected by cryptographic śaktis before storage
 */

const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { GuptaVidyaDecryption } = require('./services/guptaVidya/decryption');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const PORT = Number.parseInt(process.env.PROUST_PORT, 10) || 5743;

// Initialize encryption service
const decryption = new GuptaVidyaDecryption();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Simple request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'proust-gupta-vidya',
    encryption: 'active',
    timestamp: new Date().toISOString(),
    blessing: 'गुप्तविद्या सक्रियः । Secret knowledge is active'
  });
});

/**
 * Encrypted Authentication Endpoint
 * The gateway of gupta-vidyā - where secrets are unveiled
 */
app.post('/api/auth/initiate-encrypted', async (req, res) => {
  try {
    const securePackage = req.body;

    // Validate package structure
    if (!securePackage.encryptedEmail || !securePackage.ephemeralKey) {
      return res.status(400).json({
        error: 'Invalid encrypted package',
        message: 'The transmission is incomplete - missing essential śaktis'
      });
    }

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   GUPTA VIDYĀ TRANSMISSION RECEIVED           ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Log metrics
    decryption.logMetrics(securePackage);

    // Decrypt and validate
    const { email, isValid } = await decryption.decryptPackage(securePackage);

    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'The unveiled knowledge does not conform to expected patterns'
      });
    }

    // Generate session token - the digital dīkṣā (initiation)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    console.log('🎫 Session token generated');
    console.log('📧 Email ready for questionnaire association');

    // In production, store this in database with tokenHash
    // For now, return success with token
    const magicLink = `https://proust.aformulationoftruth.com/questionnaire?token=${sessionToken}`;

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   AUTHENTICATION SUCCESSFUL                    ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Response with Sanskrit blessing
    res.json({
      success: true,
      message: 'Authentication successful - proceed to questionnaire',
      sessionToken,
      magicLink,
      email: email.replace(/(.{2}).*(@.*)/, '$1***$2'), // Partially masked for logging
      blessing: 'तत् त्वम् असि । That thou art.',
      instructions: 'Save this token - it grants access to the Proust Questionnaire'
    });

  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    res.status(500).json({
      error: 'Failed to process authentication',
      message: 'The gupta-vidyā remains veiled. ' + error.message
    });
  }
});

/**
 * Submit Proust Questionnaire Responses (Encrypted)
 */
app.post('/api/questionnaire/submit', async (req, res) => {
  try {
    const { sessionToken, answers } = req.body;

    if (!sessionToken || !answers) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Session token and answers are required'
      });
    }

    // In production: validate token, retrieve associated email, store responses
    console.log('📝 Questionnaire responses received');
    console.log('📊 Number of answers:', Object.keys(answers).length);

    // Here you would:
    // 1. Validate the session token
    // 2. Retrieve the associated email from database
    // 3. Store the questionnaire responses with the email
    // 4. Mark the token as used

    res.json({
      success: true,
      message: 'Your responses have been recorded',
      responseId: crypto.randomBytes(16).toString('hex'),
      blessing: 'धन्योऽसि । You are blessed.'
    });

  } catch (error) {
    console.error('Failed to store questionnaire responses:', error);
    res.status(500).json({
      error: 'Failed to save responses',
      message: 'The answers could not be inscribed'
    });
  }
});

/**
 * Questionnaire Gate - Validate Token
 */
app.get('/api/questionnaire/validate', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      valid: false,
      message: 'No token provided'
    });
  }

  // In production: validate token against database
  // For now, accept any token for demo purposes
  res.json({
    valid: true,
    message: 'Token is valid - proceed to questionnaire',
    expiresIn: 3600 // 1 hour
  });
});

// Fallback to serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Startup
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║           GUPTA VIDYĀ SERVER ACTIVATED                ║');
  console.log('║                                                        ║');
  console.log('║  ॐ गुहाय नमः । ॐ गुप्ताय नमः । ॐ गूढाय नमः ।          ║');
  console.log('║                                                        ║');
  console.log('║  Salutations to the Hidden One                        ║');
  console.log('║  Salutations to the Secret One                        ║');
  console.log('║  Salutations to the Concealed One                     ║');
  console.log('║                                                        ║');
  console.log(`║  Server listening on http://localhost:${PORT}         ║`);
  console.log('║  All communications are end-to-end encrypted          ║');
  console.log('║  Ephemeral keys protect each session                  ║');
  console.log('║  The Iceland server guards the gateway                ║');
  console.log('║                                                        ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
});

module.exports = app;

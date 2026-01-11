/**
 * Twilio Verify API Integration
 *
 * Uses Twilio's Verify API service for phone verification
 * Supports SMS, voice call, and WhatsApp channels
 *
 * Requires environment variables:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_VERIFY_SERVICE_SID (optional, enables Verify API)
 */

import https from 'https';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

/**
 * Check if Twilio Verify is configured
 */
export function isTwilioVerifyEnabled() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID);
}

/**
 * Send verification code via Twilio Verify API
 * @param {string} phoneNumber - E.164 formatted phone number (e.g., +1234567890)
 * @param {string} channel - 'sms', 'call', or 'whatsapp'
 * @returns {Promise<object>} - Verification result
 */
export async function sendVerification(phoneNumber, channel = 'sms') {
  if (!isTwilioVerifyEnabled()) {
    throw new Error('Twilio Verify is not configured. Set TWILIO_VERIFY_SERVICE_SID environment variable.');
  }

  // Validate channel
  const validChannels = ['sms', 'call', 'whatsapp'];
  if (!validChannels.includes(channel)) {
    throw new Error(`Invalid channel: ${channel}. Must be one of: ${validChannels.join(', ')}`);
  }

  // Prepare request data
  const data = new URLSearchParams({
    To: phoneNumber,
    Channel: channel
  });

  // Make API request
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const options = {
      hostname: 'verify.twilio.com',
      path: `/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data.toString())
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Success
            resolve({
              success: true,
              sid: response.sid,
              status: response.status,
              to: response.to,
              channel: response.channel,
              valid: response.valid
            });
          } else {
            // Error from Twilio
            reject(new Error(response.message || `Twilio error: ${res.statusCode}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Twilio response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Twilio request failed: ${error.message}`));
    });

    req.write(data.toString());
    req.end();
  });
}

/**
 * Verify code sent to phone number
 * @param {string} phoneNumber - E.164 formatted phone number
 * @param {string} code - Verification code entered by user
 * @returns {Promise<object>} - Verification check result
 */
export async function verifyCode(phoneNumber, code) {
  if (!isTwilioVerifyEnabled()) {
    throw new Error('Twilio Verify is not configured. Set TWILIO_VERIFY_SERVICE_SID environment variable.');
  }

  // Prepare request data
  const data = new URLSearchParams({
    To: phoneNumber,
    Code: code
  });

  // Make API request
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const options = {
      hostname: 'verify.twilio.com',
      path: `/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data.toString())
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Success
            resolve({
              success: true,
              sid: response.sid,
              status: response.status,
              valid: response.valid,
              to: response.to
            });
          } else {
            // Error from Twilio
            reject(new Error(response.message || `Twilio error: ${res.statusCode}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Twilio response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Twilio request failed: ${error.message}`));
    });

    req.write(data.toString());
    req.end();
  });
}

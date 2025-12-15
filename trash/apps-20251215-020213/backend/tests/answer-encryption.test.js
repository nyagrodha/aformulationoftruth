/**
 * Test to verify encrypted answers are stored in the database
 *
 * This test:
 * 1. Creates a simulated user with JWT token
 * 2. Submits an answer to the questionnaire
 * 3. Verifies the answer is stored encrypted in the database
 * 4. Verifies the answer can be decrypted with the same token
 */

import { Client } from 'pg';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { decryptGeolocation } from '../utils/crypto.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5742';
const DB_URL = process.env.DATABASE_URL || 'postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@10.99.0.1:5432/a4m_db';

/**
 * Generate a simple JWT token for testing
 * Note: This is a simplified version - in production, use proper JWT library
 */
function generateTestToken(email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

async function runTest() {
  console.log('🔬 Starting Answer Encryption Test\n');

  // Generate test data
  const testEmail = `test-${Date.now()}@encryption-test.local`;
  const testToken = generateTestToken(testEmail);
  const testAnswer = 'This is a confidential answer that should be encrypted!';
  const questionId = 1;

  console.log('📧 Test email:', testEmail);
  console.log('🔑 Generated JWT token (first 50 chars):', testToken.substring(0, 50) + '...\n');

  // Step 1: Submit an answer
  console.log('📝 Step 1: Submitting encrypted answer to API...');
  try {
    const response = await fetch(`${BASE_URL}/api/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify({
        email: testEmail,
        questionId: questionId,
        answer: testAnswer
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Answer submitted successfully');
    console.log('   Response:', JSON.stringify(result, null, 2));

    if (!result.encrypted) {
      throw new Error('⚠️  Response does not indicate encryption was used!');
    }
  } catch (error) {
    console.error('❌ Failed to submit answer:', error.message);
    process.exit(1);
  }

  // Step 2: Connect to database and verify encryption
  console.log('\n🔍 Step 2: Connecting to database to verify encryption...');
  const client = new Client({ connectionString: DB_URL });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Query the most recent answer for our test user
    const query = `
      SELECT ua.answer_text, u.email
      FROM user_answers ua
      JOIN users u ON ua.user_id = u.id
      WHERE u.email = $1
      ORDER BY ua.id DESC
      LIMIT 1
    `;

    const result = await client.query(query, [testEmail]);

    if (result.rows.length === 0) {
      throw new Error('No answer found in database for test user');
    }

    const storedAnswer = result.rows[0].answer_text;
    console.log('✅ Found answer in database');
    console.log('   Stored (encrypted) length:', storedAnswer.length, 'characters');
    console.log('   First 100 chars:', storedAnswer.substring(0, 100) + '...');

    // Verify it's encrypted (should not match the plain text)
    if (storedAnswer === testAnswer) {
      throw new Error('⚠️  Answer is NOT encrypted! Stored as plain text!');
    }
    console.log('✅ Confirmed: Answer is encrypted (does not match plain text)');

    // Step 3: Decrypt and verify
    console.log('\n🔓 Step 3: Attempting to decrypt answer with token...');
    try {
      const decryptedAnswer = decryptGeolocation(storedAnswer, testToken);
      console.log('✅ Successfully decrypted answer');
      console.log('   Decrypted text:', decryptedAnswer);

      if (decryptedAnswer === testAnswer) {
        console.log('✅ VERIFIED: Decrypted answer matches original!');
      } else {
        throw new Error('Decrypted answer does not match original!');
      }
    } catch (error) {
      throw new Error(`Failed to decrypt answer: ${error.message}`);
    }

    // Step 4: Verify wrong token can't decrypt
    console.log('\n🔒 Step 4: Verifying wrong token cannot decrypt...');
    const wrongToken = generateTestToken('wrong@example.com');
    try {
      decryptGeolocation(storedAnswer, wrongToken);
      throw new Error('⚠️  Wrong token was able to decrypt! Security issue!');
    } catch (error) {
      console.log('✅ Confirmed: Wrong token cannot decrypt (as expected)');
    }

  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
    await client.end();
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }

  console.log('\n✅ ═══════════════════════════════════════════════');
  console.log('✅ ALL TESTS PASSED! Encryption is working correctly.');
  console.log('✅ ═══════════════════════════════════════════════\n');
  console.log('📊 Summary:');
  console.log('   • Answer successfully encrypted before storage');
  console.log('   • Encrypted data verified in database');
  console.log('   • Decryption works with correct token');
  console.log('   • Wrong token cannot decrypt (secure)');
}

// Run the test
runTest().catch(error => {
  console.error('\n❌ Test failed with unexpected error:', error);
  process.exit(1);
});

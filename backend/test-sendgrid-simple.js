#!/usr/bin/env node

/**
 * Simple SendGrid Test - Minimal Example
 * Tests if SendGrid API key is valid and identifies sender verification issue
 */

import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

console.log('\n=== SendGrid Simple Test ===\n');

// Set API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log('API Key configured:', process.env.SENDGRID_API_KEY.substring(0, 20) + '...');
console.log('From Email:', process.env.SENDGRID_FROM_EMAIL);
console.log();

// Try different sender addresses to test
const testSenders = [
  process.env.SENDGRID_FROM_EMAIL,
  'noreply@aformulationoftruth.com',
  'admin@aformulationoftruth.com',
];

console.log('Testing different sender addresses...\n');

async function testSender(fromEmail) {
  const msg = {
    to: 'test@example.com',
    from: fromEmail,
    subject: 'Test Email from A Formulation of Truth',
    text: 'This is a test email to verify SendGrid sender configuration.',
    html: '<strong>This is a test email to verify SendGrid sender configuration.</strong>',
  };

  console.log(`Testing from: ${fromEmail}`);

  try {
    await sgMail.send(msg);
    console.log(`  ✓ SUCCESS - Email accepted by SendGrid`);
    console.log(`    This sender (${fromEmail}) is verified!\n`);
    return true;
  } catch (error) {
    if (error.response) {
      const body = error.response.body;
      console.log(`  ✗ FAILED - ${error.code}`);

      if (body.errors && body.errors[0]) {
        console.log(`    Error: ${body.errors[0].message}`);
        if (body.errors[0].field === 'from') {
          console.log(`    → Sender "${fromEmail}" is NOT verified in SendGrid`);
        }
      }
      console.log();
    } else {
      console.log(`  ✗ ERROR: ${error.message}\n`);
    }
    return false;
  }
}

// Test all sender addresses
(async () => {
  let foundVerified = false;

  for (const sender of testSenders) {
    const success = await testSender(sender);
    if (success) {
      foundVerified = true;
      break;
    }
  }

  console.log('='.repeat(70));

  if (foundVerified) {
    console.log('\n✅ Found a verified sender! Update .env.local with this address.\n');
  } else {
    console.log('\n⚠️  No verified senders found. You need to:');
    console.log('   1. Go to SendGrid Dashboard: https://app.sendgrid.com/');
    console.log('   2. Navigate to Settings → Sender Authentication');
    console.log('   3. Choose one of these options:\n');
    console.log('   Option A - Single Sender Verification (Quick):');
    console.log('     • Click "Verify a Single Sender"');
    console.log('     • Add the email you want to use (e.g., nyagrodha@icloud.com)');
    console.log('     • Check your email for verification link');
    console.log('     • Click the link to verify\n');
    console.log('   Option B - Domain Authentication (Recommended):');
    console.log('     • Click "Authenticate Your Domain"');
    console.log('     • Follow steps to add DNS records for aformulationoftruth.com');
    console.log('     • Once verified, ANY email @aformulationoftruth.com will work\n');
    console.log('   SendGrid Docs: https://docs.sendgrid.com/ui/sending-email/sender-verification\n');
  }
})();

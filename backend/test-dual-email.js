#!/usr/bin/env node

/**
 * Dual Email System Test Script
 *
 * Tests the routing of emails between SendGrid (for users) and Apple SMTP (for admins)
 */

import { sendMagicLinkEmail, isAdminEmail, getAdminEmails, healthCheck } from './utils/mailer.js';

console.log('\n=== Dual Email System Test ===\n');

// Display configuration
console.log('Admin Email Addresses:', getAdminEmails());
console.log();

// Test email routing logic
const testEmails = [
  'user@example.com',
  'test@gmail.com',
  'root@aformulationoftruth.com',
  'admin@aformulationoftruth.com',
  'marcel@aformulationoftruth.com'
];

console.log('Email Routing Test:');
console.log('-'.repeat(70));
testEmails.forEach(email => {
  const isAdmin = isAdminEmail(email);
  const provider = isAdmin ? 'Apple SMTP' : 'SendGrid';
  console.log(`${email.padEnd(40)} -> ${provider} ${isAdmin ? '(Admin)' : '(User)'}`);
});
console.log();

// Health check
console.log('Running health check...');
healthCheck().then(result => {
  console.log('\nHealth Check Results:');
  console.log(JSON.stringify(result, null, 2));

  // Test sending an email
  console.log('\n--- Testing Email Send ---\n');

  // Test 1: Regular user email (should use SendGrid)
  console.log('Test 1: Sending to regular user (test@example.com)...');
  return sendMagicLinkEmail('test@example.com', 'test-token-user-123')
    .then(result => {
      console.log('✓ User email result:', result);
      console.log();

      // Test 2: Admin email (should use Apple SMTP)
      console.log('Test 2: Sending to admin (root@aformulationoftruth.com)...');
      return sendMagicLinkEmail('root@aformulationoftruth.com', 'test-token-admin-456');
    })
    .then(result => {
      console.log('✓ Admin email result:', result);
      console.log();
      console.log('=== All tests completed successfully! ===\n');
    })
    .catch(error => {
      console.error('✗ Email send test failed:', error.message);
      console.log('\nNote: Email send may fail if credentials are not configured,');
      console.log('but routing logic should work correctly.');
    });
}).catch(error => {
  console.error('✗ Health check failed:', error.message);
  process.exit(1);
});

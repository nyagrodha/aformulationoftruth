#!/usr/bin/env node

/**
 * Real Email Test - Send actual emails to test both providers
 */

import { sendMagicLinkEmail, healthCheck } from './utils/mailer.js';

console.log('\n=== Real Email Delivery Test ===\n');

// Health check first
console.log('Running health check...');
const health = await healthCheck();
console.log('Health Status:', health.status);
console.log('  SendGrid:', health.sendgrid.status);
console.log('  Apple SMTP:', health.smtp.status);
console.log();

// Test 1: User email via SendGrid
console.log('Test 1: Sending user email via SendGrid');
console.log('  To: nyagrodha@me.com');
console.log('  Provider: SendGrid');
console.log();

try {
  const result1 = await sendMagicLinkEmail('nyagrodha@me.com', 'test-token-user-' + Date.now());
  console.log('✅ SendGrid Test SUCCESS!');
  console.log('  Message ID:', result1.messageId);
  console.log('  Provider:', result1.provider);
  console.log('  Timestamp:', result1.timestamp);
  console.log();
} catch (error) {
  console.log('❌ SendGrid Test FAILED:', error.message);
  console.log();
}

// Test 2: Admin email via Apple SMTP
console.log('Test 2: Sending admin email via Apple SMTP');
console.log('  To: root@aformulationoftruth.com');
console.log('  Provider: Apple SMTP');
console.log();

try {
  const result2 = await sendMagicLinkEmail('root@aformulationoftruth.com', 'test-token-admin-' + Date.now());
  console.log('✅ Apple SMTP Test SUCCESS!');
  console.log('  Message ID:', result2.messageId);
  console.log('  Provider:', result2.provider);
  console.log('  Timestamp:', result2.timestamp);
  console.log();
} catch (error) {
  console.log('❌ Apple SMTP Test FAILED:', error.message);
  console.log();
}

console.log('=== Test Complete ===');
console.log('\nCheck your inbox at nyagrodha@me.com for the test email!');

#!/usr/bin/env tsx
/**
 * Newsletter Email Decryption Utility
 *
 * This script decrypts all newsletter email addresses stored in the database.
 * It supports both legacy format (without salt) and new format (with salt).
 *
 * Usage:
 *   npm run decrypt-emails
 *   or
 *   tsx scripts/decrypt-newsletter-emails.ts
 *
 * Environment Variables Required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - VPS_ENCRYPTION_KEY or ENCRYPTION_KEY: Encryption key for decryption
 *
 * Output:
 *   - Prints all decrypted email addresses with subscription status and dates
 *   - Optionally exports to JSON file with --output flag
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { newsletterEmails } from '../shared/schema';
import { EncryptionService } from '../server/services/encryptionService';
import * as fs from 'fs';
import * as path from 'path';

const { Pool } = pg;

interface DecryptedEmail {
  id: string;
  email: string;
  subscribed: boolean;
  createdAt: Date;
  updatedAt: Date;
  hasLegacyFormat: boolean;
}

async function main() {
  // Check for required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('Please set it in your .env file or export it:');
    console.error('  export DATABASE_URL="postgresql://user:pass@host:port/dbname"');
    process.exit(1);
  }

  const encryptionKey = process.env.VPS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error('❌ ERROR: VPS_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable is not set');
    console.error('Please set it in your .env file');
    process.exit(1);
  }

  console.log('🔐 Newsletter Email Decryption Utility');
  console.log('=====================================\n');

  // Initialize database connection
  console.log('📊 Connecting to database...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    // Initialize encryption service
    const encryptionService = new EncryptionService();

    // Fetch all newsletter emails from database
    console.log('📧 Fetching newsletter emails...\n');
    const emails = await db
      .select()
      .from(newsletterEmails)
      .orderBy(newsletterEmails.createdAt);

    if (emails.length === 0) {
      console.log('ℹ️  No newsletter emails found in database.');
      await pool.end();
      process.exit(0);
    }

    console.log(`Found ${emails.length} email(s) in database\n`);
    console.log('Decrypting emails...\n');
    console.log('─'.repeat(80));

    const decryptedEmails: DecryptedEmail[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const emailRecord of emails) {
      try {
        // Determine if this is legacy format (no salt) or new format (with salt)
        const hasLegacyFormat = !emailRecord.salt;

        // Prepare encrypted data object
        const encryptedData = hasLegacyFormat
          ? {
              encrypted: emailRecord.encryptedEmail,
              iv: emailRecord.iv,
              tag: emailRecord.tag,
            }
          : {
              encrypted: emailRecord.encryptedEmail,
              iv: emailRecord.iv,
              tag: emailRecord.tag,
              salt: emailRecord.salt as string,
            };

        // Decrypt the email
        const decryptedEmail = encryptionService.decrypt(encryptedData);

        decryptedEmails.push({
          id: emailRecord.id,
          email: decryptedEmail,
          subscribed: emailRecord.subscribed,
          createdAt: emailRecord.createdAt,
          updatedAt: emailRecord.updatedAt,
          hasLegacyFormat,
        });

        // Display decrypted email
        const status = emailRecord.subscribed ? '✅ Subscribed' : '❌ Unsubscribed';
        const format = hasLegacyFormat ? '(legacy)' : '(new format)';
        const createdDate = emailRecord.createdAt.toISOString().split('T')[0];

        console.log(`${status} | ${decryptedEmail}`);
        console.log(`         | ID: ${emailRecord.id}`);
        console.log(`         | Created: ${createdDate} ${format}`);
        console.log('─'.repeat(80));

        successCount++;
      } catch (error) {
        console.error(`\n❌ Failed to decrypt email ID: ${emailRecord.id}`);
        console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        failureCount++;
      }
    }

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   Total emails: ${emails.length}`);
    console.log(`   Successfully decrypted: ${successCount}`);
    if (failureCount > 0) {
      console.log(`   Failed to decrypt: ${failureCount}`);
    }

    const activeCount = decryptedEmails.filter(e => e.subscribed).length;
    const legacyCount = decryptedEmails.filter(e => e.hasLegacyFormat).length;
    console.log(`   Active subscriptions: ${activeCount}`);
    console.log(`   Legacy format entries: ${legacyCount}`);

    // Check for output flag
    const args = process.argv.slice(2);
    if (args.includes('--output') || args.includes('-o')) {
      const outputPath = path.join(process.cwd(), 'newsletter-emails-export.json');
      fs.writeFileSync(
        outputPath,
        JSON.stringify(decryptedEmails, null, 2),
        'utf-8'
      );
      console.log(`\n💾 Exported decrypted emails to: ${outputPath}`);
    }

    console.log('\n✅ Decryption complete!');
  } catch (error) {
    console.error('\n❌ Error during decryption process:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

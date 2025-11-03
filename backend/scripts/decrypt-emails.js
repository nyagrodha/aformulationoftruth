#!/usr/bin/env node
// scripts/decrypt-emails.js
// CLI tool to decrypt and list newsletter subscriber emails
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { decryptEmail } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  count: args.includes('--count') || args.includes('-c'),
  active: args.includes('--active') || args.includes('-a'),
  export: args.includes('--export') || args.includes('-e'),
  limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || null
};

function showHelp() {
  console.log(`
Newsletter Email Decryption Tool
=================================

Usage: node scripts/decrypt-emails.js [OPTIONS]

Options:
  -h, --help           Show this help message
  -c, --count          Show only the count of subscribers
  -a, --active         Show only active subscribers (not unsubscribed)
  -e, --export         Export to CSV format
  --limit=N            Limit results to N emails

Environment Variables Required:
  DATABASE_URL            PostgreSQL connection string
  EMAIL_ENCRYPTION_KEY    Encryption key (min 32 chars)

Examples:
  node scripts/decrypt-emails.js
  node scripts/decrypt-emails.js --active --limit=10
  node scripts/decrypt-emails.js --export > subscribers.csv
  node scripts/decrypt-emails.js --count

Security Notice:
  This tool decrypts sensitive data. Ensure you have proper authorization
  and handle the output securely. Do not share decrypted emails.
`);
}

async function getSubscribers(client, activeOnly = false, limit = null) {
  let query = `
    SELECT
      id,
      encrypted_email,
      subscribed_at,
      unsubscribed_at,
      ip_address
    FROM newsletter_subscribers
  `;

  if (activeOnly) {
    query += ' WHERE unsubscribed_at IS NULL';
  }

  query += ' ORDER BY subscribed_at DESC';

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const result = await client.query(query);
  return result.rows;
}

async function main() {
  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  // Check for required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  if (!process.env.EMAIL_ENCRYPTION_KEY) {
    console.error('❌ Error: EMAIL_ENCRYPTION_KEY environment variable not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();

    // Get count only
    if (flags.count) {
      const result = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE unsubscribed_at IS NULL) as active,
          COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL) as unsubscribed
        FROM newsletter_subscribers
      `);

      const stats = result.rows[0];
      console.log('\nNewsletter Subscriber Statistics');
      console.log('================================');
      console.log(`Total subscribers:      ${stats.total}`);
      console.log(`Active subscribers:     ${stats.active}`);
      console.log(`Unsubscribed:           ${stats.unsubscribed}`);
      console.log('');
      await client.end();
      return;
    }

    // Get subscriber list
    const subscribers = await getSubscribers(client, flags.active, flags.limit);

    if (subscribers.length === 0) {
      console.log('No subscribers found.');
      await client.end();
      return;
    }

    // Export to CSV
    if (flags.export) {
      console.log('id,email,subscribed_at,unsubscribed_at,ip_address');
      for (const sub of subscribers) {
        try {
          const email = decryptEmail(sub.encrypted_email);
          const unsubscribed = sub.unsubscribed_at || '';
          console.log(`${sub.id},"${email}","${sub.subscribed_at}","${unsubscribed}","${sub.ip_address || ''}"`);
        } catch (error) {
          console.error(`Error decrypting email ID ${sub.id}: ${error.message}`, { stream: 'stderr' });
        }
      }
    } else {
      // Pretty print
      console.log('\nNewsletter Subscribers');
      console.log('======================\n');

      for (const sub of subscribers) {
        try {
          const email = decryptEmail(sub.encrypted_email);
          const status = sub.unsubscribed_at ? '❌ Unsubscribed' : '✅ Active';
          console.log(`ID: ${sub.id}`);
          console.log(`Email: ${email}`);
          console.log(`Status: ${status}`);
          console.log(`Subscribed: ${sub.subscribed_at}`);
          if (sub.unsubscribed_at) {
            console.log(`Unsubscribed: ${sub.unsubscribed_at}`);
          }
          if (sub.ip_address) {
            console.log(`IP: ${sub.ip_address}`);
          }
          console.log('---');
        } catch (error) {
          console.error(`❌ Error decrypting email ID ${sub.id}: ${error.message}`);
        }
      }

      console.log(`\nTotal: ${subscribers.length} subscriber(s)\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

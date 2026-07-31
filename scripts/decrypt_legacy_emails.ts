#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * Legacy Newsletter Email Decryption Utility
 *
 * Decrypts emails from the old `newsletter_emails` table format.
 *
 * USAGE:
 *   export VPS_ENCRYPTION_KEY="your-32-char-encryption-key"
 *   export DATABASE_URL="postgresql://user:pass@host:5432/db"
 *   deno run --allow-env --allow-net scripts/decrypt_legacy_emails.ts
 *
 * The encryption format uses:
 *   - AES-256-GCM cipher
 *   - PBKDF2-SHA256 key derivation (600,000 iterations)
 *   - Per-email salt stored in `salt` column (base64)
 *   - IV stored in `iv` column (base64)
 *   - Auth tag stored in `tag` column (base64)
 *   - Ciphertext stored in `encrypted_email` column (base64)
 *
 * WARNING: This outputs plaintext emails to stdout. Use with caution.
 */

import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptEmail(
  encryptedEmail: string,
  iv: string,
  tag: string,
  salt: string,
  encryptionKey: string
): Promise<string> {
  const saltBytes = base64ToBytes(salt);
  const ivBytes = base64ToBytes(iv);
  const tagBytes = base64ToBytes(tag);
  const ciphertextBytes = base64ToBytes(encryptedEmail);

  // AES-GCM expects ciphertext + tag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  ciphertextWithTag.set(ciphertextBytes);
  ciphertextWithTag.set(tagBytes, ciphertextBytes.length);

  const key = await deriveKey(encryptionKey, saltBytes);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertextWithTag
  );

  return decoder.decode(plaintext);
}

async function main() {
  const encryptionKey = Deno.env.get('VPS_ENCRYPTION_KEY');
  const databaseUrl = Deno.env.get('DATABASE_URL');

  if (!encryptionKey) {
    console.error('ERROR: VPS_ENCRYPTION_KEY environment variable not set');
    Deno.exit(1);
  }

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    Deno.exit(1);
  }

  const pool = new Pool(databaseUrl, 1);

  try {
    const client = await pool.connect();

    const result = await client.queryObject<{
      id: string;
      encrypted_email: string;
      iv: string;
      tag: string;
      salt: string;
      subscribed: boolean;
      created_at: Date;
    }>(
      `SELECT id, encrypted_email, iv, tag, salt, subscribed, created_at
       FROM newsletter_emails
       ORDER BY created_at`
    );

    console.log(`Found ${result.rows.length} encrypted emails:\n`);
    console.log('ID | Email | Subscribed | Created');
    console.log('-'.repeat(80));

    for (const row of result.rows) {
      try {
        const email = await decryptEmail(
          row.encrypted_email,
          row.iv,
          row.tag,
          row.salt,
          encryptionKey
        );
        console.log(`${row.id} | ${email} | ${row.subscribed} | ${row.created_at}`);
      } catch (err) {
        console.log(`${row.id} | [DECRYPTION FAILED: ${err}] | ${row.subscribed} | ${row.created_at}`);
      }
    }

    client.release();
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main();
}

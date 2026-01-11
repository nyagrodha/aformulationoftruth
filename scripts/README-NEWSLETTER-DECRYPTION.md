# Newsletter Email Decryption Utility

This utility allows you to decrypt newsletter email addresses stored in the database.

## Overview

Newsletter emails are stored encrypted using **AES-256-GCM** encryption with the following security features:

- **Per-encryption random salts** (new format) - Each email gets a unique salt
- **Legacy support** - Can decrypt older entries that used a static salt
- **scrypt key derivation** - Strong key derivation with configurable parameters
- **Authentication tags** - Ensures data integrity and authenticity

## Requirements

- Node.js with TypeScript support (`tsx`)
- Access to the PostgreSQL database
- Environment variables configured in `.env`:
  - `DATABASE_URL`: PostgreSQL connection string
  - `VPS_ENCRYPTION_KEY` or `ENCRYPTION_KEY`: The encryption key used to encrypt emails

## Usage

### Method 1: Using the Bash Script (Recommended)

```bash
# Display all decrypted emails
./scripts/decrypt-emails.sh

# Export decrypted emails to JSON file
./scripts/decrypt-emails.sh --output
```

### Method 2: Direct TypeScript Execution

```bash
# Display all decrypted emails
tsx scripts/decrypt-newsletter-emails.ts

# Export to JSON file
tsx scripts/decrypt-newsletter-emails.ts --output
```

### Method 3: Using npm/package.json

Add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "decrypt-emails": "tsx scripts/decrypt-newsletter-emails.ts",
    "decrypt-emails:export": "tsx scripts/decrypt-newsletter-emails.ts --output"
  }
}
```

Then run:

```bash
npm run decrypt-emails
npm run decrypt-emails:export
```

## Output Format

The script displays each decrypted email with:

- **Status**: ✅ Subscribed or ❌ Unsubscribed
- **Email address**: The decrypted email
- **ID**: Database record ID
- **Created date**: When the subscription was created
- **Format**: `(legacy)` for old format without salt, `(new format)` for entries with salt

### Example Output

```
🔐 Newsletter Email Decryption Utility
=====================================

📊 Connecting to database...
📧 Fetching newsletter emails...

Found 3 email(s) in database

Decrypting emails...

────────────────────────────────────────────────────────────────────────────────
✅ Subscribed | user@example.com
         | ID: 550e8400-e29b-41d4-a716-446655440000
         | Created: 2025-12-15 (new format)
────────────────────────────────────────────────────────────────────────────────
✅ Subscribed | another@example.com
         | ID: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
         | Created: 2025-12-14 (legacy)
────────────────────────────────────────────────────────────────────────────────

📊 Summary:
   Total emails: 2
   Successfully decrypted: 2
   Active subscriptions: 2
   Legacy format entries: 1

✅ Decryption complete!
```

## JSON Export

When using the `--output` flag, a file named `newsletter-emails-export.json` is created in the project root with the following structure:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "subscribed": true,
    "createdAt": "2025-12-15T10:30:00.000Z",
    "updatedAt": "2025-12-15T10:30:00.000Z",
    "hasLegacyFormat": false
  }
]
```

## Security Notes

⚠️ **IMPORTANT SECURITY CONSIDERATIONS:**

1. **Keep the decryption script secure**: This script can decrypt all newsletter emails. Restrict access to authorized personnel only.

2. **Protect the exported JSON file**: If you export emails to JSON, the file contains plaintext email addresses. Handle it securely:
   - Don't commit it to git (already in .gitignore)
   - Delete it after use
   - Encrypt it if you need to store it

3. **Environment variable security**: The `VPS_ENCRYPTION_KEY` or `ENCRYPTION_KEY` is critical:
   - Never commit it to version control
   - Use strong, randomly-generated keys (at least 32 characters)
   - Rotate keys periodically following a secure key rotation procedure

4. **Audit access**: Log who runs this script and when

## Migrating from Legacy to New Format

If you have legacy-format encrypted emails (without salt), they will still decrypt correctly. To migrate them to the new format:

1. Run this decryption script with `--output` to export emails
2. Create a migration script that:
   - Reads the exported JSON
   - Re-encrypts each email using the current EncryptionService (which adds salt)
   - Updates the database records with the new encrypted values

## Troubleshooting

### "DATABASE_URL environment variable is not set"

Make sure your `.env` file contains:

```bash
DATABASE_URL="postgresql://username:password@host:5432/database"
```

### "VPS_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable is not set"

Add to your `.env` file:

```bash
VPS_ENCRYPTION_KEY="your-secure-encryption-key-here"
```

### "Failed to decrypt email"

This could happen if:
- The encryption key has changed since the email was encrypted
- The database record is corrupted
- The encryption format doesn't match expectations

Check the error message for specific details.

### "tsx: command not found"

Install tsx globally:

```bash
npm install -g tsx
```

Or install it locally in the project:

```bash
npm install --save-dev tsx
```

## Technical Details

### Encryption Format

**New Format (with salt):**
```typescript
{
  encrypted: string,  // Base64-encoded ciphertext
  iv: string,         // Base64-encoded initialization vector (12 bytes)
  tag: string,        // Base64-encoded authentication tag (16 bytes)
  salt: string        // Base64-encoded random salt (16 bytes)
}
```

**Legacy Format (without salt):**
```typescript
{
  encrypted: string,  // Hex-encoded ciphertext
  iv: string,         // Hex-encoded initialization vector
  tag: string         // Hex-encoded authentication tag
}
```

### Key Derivation Parameters

- **Algorithm**: scrypt
- **CPU/Memory cost (N)**: 16384 (2^14)
- **Block size (r)**: 8
- **Parallelization (p)**: 1
- **Output length**: 32 bytes (256 bits)

### Database Schema

The `newsletter_emails` table contains:

- `id`: UUID primary key
- `encrypted_email`: Encrypted email address
- `iv`: Initialization vector
- `tag`: Authentication tag
- `salt`: Random salt (NULL for legacy entries)
- `unsubscribe_token`: Unique token for unsubscribing
- `subscribed`: Boolean subscription status
- `created_at`: Timestamp
- `updated_at`: Timestamp

## Related Files

- **Encryption Service**: `/server/services/encryptionService.ts`
- **Database Schema**: `/shared/schema.ts`
- **API Routes**: `/server/routes.ts` (newsletter signup endpoint)
- **Migration**: `/migrations/0002_add_salt_to_newsletter_emails.sql`

## Support

For issues or questions about the newsletter encryption system, contact the site administrator or review the source code in the repository.

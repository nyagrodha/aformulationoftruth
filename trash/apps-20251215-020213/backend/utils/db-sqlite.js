import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Initialize SQLite database for magic link tokens
const dbPath = path.join(__dirname, '../magic_links.db');
const db = new sqlite3.Database(dbPath);
// Create tokens table
db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS magic_link_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      geolocation TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
    db.run(`
    CREATE INDEX IF NOT EXISTS idx_expires_at ON magic_link_tokens(expires_at)
  `);
    console.log('✓ SQLite magic link database initialized');
});
// Generate a secure random token
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
// Save magic link token with 10-minute expiry
export function saveMagicLinkToken(email, token, geolocation = null) {
    return new Promise((resolve, reject) => {
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes from now
        const geoJSON = geolocation ? JSON.stringify(geolocation) : null;
        db.run('INSERT INTO magic_link_tokens (token, email, expires_at, geolocation) VALUES (?, ?, ?, ?)', [token, email, expiresAt, geoJSON], (err) => {
            if (err) {
                console.error('Error saving token:', err);
                reject(err);
            }
            else {
                console.log(`✓ Magic link token saved for ${email} (expires in 10 min)`);
                resolve();
            }
        });
    });
}
// Find and validate magic link token
export function findMagicLinkToken(token) {
    return new Promise((resolve, reject) => {
        db.get('SELECT email, expires_at, geolocation FROM magic_link_tokens WHERE token = ?', [token], (err, row) => {
            if (err) {
                console.error('Error finding token:', err);
                reject(err);
                return;
            }
            if (!row) {
                resolve(null);
                return;
            }
            const now = Math.floor(Date.now() / 1000);
            // Check if expired
            if (now > row.expires_at) {
                // Delete expired token
                db.run('DELETE FROM magic_link_tokens WHERE token = ?', [token]);
                resolve(null);
                return;
            }
            resolve({
                email: row.email,
                expires_at: new Date(row.expires_at * 1000).toISOString(),
                geolocation: row.geolocation ? JSON.parse(row.geolocation) : null
            });
        });
    });
}
// Delete used magic link token
export function deleteMagicLinkToken(token) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM magic_link_tokens WHERE token = ?', [token], (err) => {
            if (err) {
                console.error('Error deleting token:', err);
                reject(err);
            }
            else {
                console.log('✓ Magic link token deleted');
                resolve();
            }
        });
    });
}
// Clean up expired tokens (run periodically)
export function cleanupExpiredTokens() {
    return new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        db.run('DELETE FROM magic_link_tokens WHERE expires_at < ?', [now], function (err) {
            if (err) {
                console.error('Error cleaning up tokens:', err);
                reject(err);
            }
            else if (this.changes > 0) {
                console.log(`✓ Cleaned up ${this.changes} expired magic link tokens`);
            }
            resolve(this.changes);
        });
    });
}
// Export database for testing
export { db };

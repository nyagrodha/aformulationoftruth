import crypto from 'crypto';
// PostgreSQL client - will be set by server.js
let dbClient = null;
export function setDatabaseClient(client) {
    dbClient = client;
}
// Generate a secure random token
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
// Save magic link token with 10-minute expiry to PostgreSQL
export async function saveMagicLinkToken(email, token) {
    if (!dbClient) {
        throw new Error('Database client not initialized');
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    await dbClient.query('INSERT INTO magic_link_tokens (token, email, expires_at) VALUES ($1, $2, $3)', [token, email, expiresAt]);
    console.log(`Magic link token saved for ${email}`);
}
// Find and validate magic link token from PostgreSQL
export async function findMagicLinkToken(token) {
    if (!dbClient) {
        throw new Error('Database client not initialized');
    }
    const result = await dbClient.query('SELECT email, expires_at FROM magic_link_tokens WHERE token = $1', [token]);
    if (result.rows.length === 0) {
        return null;
    }
    const record = result.rows[0];
    // Check if expired
    if (new Date() > new Date(record.expires_at)) {
        await dbClient.query('DELETE FROM magic_link_tokens WHERE token = $1', [token]);
        return null;
    }
    return {
        email: record.email,
        expires_at: record.expires_at
    };
}
// Delete used magic link token from PostgreSQL
export async function deleteMagicLinkToken(token) {
    if (!dbClient) {
        throw new Error('Database client not initialized');
    }
    await dbClient.query('DELETE FROM magic_link_tokens WHERE token = $1', [token]);
    console.log('Magic link token deleted');
}
// Clean up expired tokens (run periodically)
export async function cleanupExpiredTokens() {
    if (!dbClient) {
        console.warn('Database client not initialized, skipping token cleanup');
        return;
    }
    const result = await dbClient.query('DELETE FROM magic_link_tokens WHERE expires_at < NOW() RETURNING token');
    const cleanedCount = result.rowCount;
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired magic link tokens`);
    }
}

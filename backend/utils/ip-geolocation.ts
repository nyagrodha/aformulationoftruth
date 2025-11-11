// IP Geolocation database utilities
// Handles saving and retrieving IP geolocation data from PostgreSQL

import { Client } from 'pg';
import { IPInfo } from './ip-lookup.js';

/**
 * Save IP geolocation data to the database
 * Updates existing records or creates new ones
 * @param dbClient - PostgreSQL client
 * @param ipData - IP information from lookup
 * @returns The IP geolocation record ID, or null on error
 */
export async function saveIPGeolocation(dbClient: Client, ipData: IPInfo): Promise<number | null> {
  try {
    // Check if IP already exists
    const existing = await dbClient.query(
      'SELECT id FROM ip_geolocation WHERE ip_address = $1',
      [ipData.ip]
    );

    if (existing.rows.length > 0) {
      // Update last_seen and increment lookup count
      await dbClient.query(
        `UPDATE ip_geolocation
         SET last_seen = NOW(),
             lookup_count = lookup_count + 1,
             city = COALESCE($2, city),
             region = COALESCE($3, region),
             country = COALESCE($4, country),
             location = COALESCE($5, location),
             timezone = COALESCE($6, timezone),
             org = COALESCE($7, org)
         WHERE ip_address = $1`,
        [
          ipData.ip,
          ipData.city,
          ipData.region,
          ipData.country,
          ipData.location,
          ipData.timezone,
          ipData.org
        ]
      );
      return existing.rows[0].id;
    }

    // Insert new IP geolocation record
    const result = await dbClient.query(
      `INSERT INTO ip_geolocation (
        ip_address, hostname, city, region, country, country_code, location,
        postal_code, timezone, org, asn,
        is_vpn, is_proxy, is_tor, is_hosting, is_relay, raw_response
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id`,
      [
        ipData.ip,
        ipData.hostname,
        ipData.city,
        ipData.region,
        ipData.country,
        ipData.country?.substring(0, 2) || null, // Extract country code if not provided
        ipData.location,
        ipData.postal_code,
        ipData.timezone,
        ipData.org,
        ipData.asn,
        ipData.is_vpn,
        ipData.is_proxy,
        ipData.is_tor,
        ipData.is_hosting,
        ipData.is_relay,
        JSON.stringify(ipData.raw_response)
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    console.error('Failed to save IP geolocation:', error);
    return null;
  }
}

/**
 * Record user IP access in history table
 * @param dbClient - PostgreSQL client
 * @param userId - User ID
 * @param ipId - IP geolocation record ID
 * @param userAgent - User agent string
 * @param action - Action type (login, register, etc.)
 */
export async function recordUserIPAccess(
  dbClient: Client,
  userId: number,
  ipId: number,
  userAgent: string | null,
  action: string
): Promise<void> {
  try {
    await dbClient.query(
      `INSERT INTO user_ip_history (user_id, ip_id, user_agent, action)
       VALUES ($1, $2, $3, $4)`,
      [userId, ipId, userAgent, action]
    );
  } catch (error) {
    console.error('Failed to record user IP access:', error);
  }
}

/**
 * Update user's current IP reference
 * @param dbClient - PostgreSQL client
 * @param userId - User ID
 * @param ipId - IP geolocation record ID
 */
export async function updateUserCurrentIP(
  dbClient: Client,
  userId: number,
  ipId: number
): Promise<void> {
  try {
    await dbClient.query(
      'UPDATE users SET current_ip_id = $1 WHERE id = $2',
      [ipId, userId]
    );
  } catch (error) {
    console.error('Failed to update user current IP:', error);
  }
}

/**
 * Get IP geolocation data by IP address
 * @param dbClient - PostgreSQL client
 * @param ipAddress - IP address to look up
 * @returns IP geolocation data or null
 */
export async function getIPGeolocation(dbClient: Client, ipAddress: string): Promise<any | null> {
  try {
    const result = await dbClient.query(
      'SELECT * FROM ip_geolocation WHERE ip_address = $1',
      [ipAddress]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Failed to get IP geolocation:', error);
    return null;
  }
}

/**
 * Get user's IP access history
 * @param dbClient - PostgreSQL client
 * @param userId - User ID
 * @param limit - Maximum number of records to return
 * @returns Array of IP access records
 */
export async function getUserIPHistory(
  dbClient: Client,
  userId: number,
  limit: number = 10
): Promise<any[]> {
  try {
    const result = await dbClient.query(
      `SELECT h.*, g.ip_address, g.city, g.country, g.is_vpn, g.is_tor
       FROM user_ip_history h
       JOIN ip_geolocation g ON h.ip_id = g.id
       WHERE h.user_id = $1
       ORDER BY h.accessed_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to get user IP history:', error);
    return [];
  }
}

/**
 * Check if IP is already registered by another user
 * Used for the 1-email-per-IP restriction
 * @param dbClient - PostgreSQL client
 * @param ipAddress - IP address to check
 * @param excludeEmail - Email to exclude from check (for re-login)
 * @returns true if IP is already registered
 */
export async function isIPRegistered(
  dbClient: Client,
  ipAddress: string,
  excludeEmail?: string
): Promise<boolean> {
  try {
    const query = excludeEmail
      ? 'SELECT 1 FROM users WHERE ip_address = $1 AND email != $2 LIMIT 1'
      : 'SELECT 1 FROM users WHERE ip_address = $1 LIMIT 1';

    const params = excludeEmail ? [ipAddress, excludeEmail] : [ipAddress];
    const result = await dbClient.query(query, params);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Failed to check IP registration:', error);
    return false;
  }
}

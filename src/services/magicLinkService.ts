import type { Pool } from 'pg';
import {
  createMagicLink,
  findActiveMagicLink,
  markMagicLinkUsed
} from '../db/magicLinkRepository.js';
import { randomToken, hashValue, timingSafeEqual } from '../utils/security.js';
import { ServiceError } from '../utils/errors.js';
import { env } from '../config/env.js';

export interface MagicLinkResult {
  token: string;
  magicLinkUrl: string;
  expiresAt: Date;
}

export interface VerifiedUser {
  email: string;
  authenticatedAt: Date;
}

const MAGIC_LINK_TTL_MINUTES = 15;

/**
 * Generates a magic link for the given email
 */
export async function generateMagicLink(pool: Pool, email: string): Promise<MagicLinkResult> {
  const token = randomToken(32);
  const tokenHash = hashValue(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await createMagicLink(pool, email, tokenHash, expiresAt);

  const baseUrl = env.APP_BASE_URL ?? 'http://localhost:5742';
  const magicLinkUrl = `${baseUrl}/auth?token=${token}`;

  return {
    token,
    magicLinkUrl,
    expiresAt
  };
}

/**
 * Verifies a magic link token and returns the authenticated user info
 */
export async function verifyMagicLink(pool: Pool, token: string): Promise<VerifiedUser> {
  const tokenHash = hashValue(token);
  const magicLink = await findActiveMagicLink(pool, tokenHash);

  if (!magicLink) {
    throw new ServiceError('RESET_INVALID', 'Invalid or expired magic link');
  }

  // Verify token hash matches (timing-safe)
  if (!timingSafeEqual(magicLink.tokenHash, tokenHash)) {
    throw new ServiceError('RESET_INVALID', 'Invalid or expired magic link');
  }

  // Check expiration
  if (magicLink.expiresAt < new Date()) {
    throw new ServiceError('RESET_EXPIRED', 'Magic link has expired');
  }

  // Mark as used
  await markMagicLinkUsed(pool, magicLink.id);

  return {
    email: magicLink.email,
    authenticatedAt: new Date()
  };
}

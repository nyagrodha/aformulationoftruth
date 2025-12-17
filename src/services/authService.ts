import type { Pool } from 'pg';
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  updateUserPassword,
  type User
} from '../db/userRepository.js';
import {
  createPasswordReset,
  findActivePasswordReset,
  markPasswordResetUsed
} from '../db/passwordResetRepository.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { randomToken, hashValue, timingSafeEqual } from '../utils/security.js';
import { ServiceError } from '../utils/errors.js';
import { env } from '../config/env.js';

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: Date;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

/**
 * Strips sensitive fields from a user object
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt
  };
}

/**
 * Registers a new user
 */
export async function registerUser(pool: Pool, input: RegisterInput): Promise<PublicUser> {
  const { email, username, password } = input;

  // Check if email already exists
  const existingEmail = await findUserByEmail(pool, email);
  if (existingEmail) {
    throw new ServiceError('USER_EXISTS', 'A user with this email already exists');
  }

  // Check if username already exists
  const existingUsername = await findUserByUsername(pool, username);
  if (existingUsername) {
    throw new ServiceError('USER_EXISTS', 'A user with this username already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(pool, { email, username, passwordHash });

  return toPublicUser(user);
}

/**
 * Authenticates a user by email/username and password
 */
export async function authenticateUser(pool: Pool, input: LoginInput): Promise<PublicUser> {
  const { identifier, password } = input;

  // Try to find user by email or username
  let user = await findUserByEmail(pool, identifier);
  if (!user) {
    user = await findUserByUsername(pool, identifier);
  }

  if (!user) {
    throw new ServiceError('INVALID_CREDENTIALS', 'Invalid email/username or password');
  }

  const isValid = await verifyPassword(user.passwordHash, password);
  if (!isValid) {
    throw new ServiceError('INVALID_CREDENTIALS', 'Invalid email/username or password');
  }

  return toPublicUser(user);
}

/**
 * Creates a password reset token for the given email
 * Returns the token (for dev) or null (for prod, where email would be sent)
 */
export async function createPasswordResetToken(pool: Pool, email: string): Promise<string | null> {
  const user = await findUserByEmail(pool, email);

  // Don't reveal if user exists
  if (!user) {
    return null;
  }

  const token = randomToken(32);
  const tokenHash = hashValue(token);
  const ttlMinutes = env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await createPasswordReset(pool, user.id, tokenHash, expiresAt);

  // TODO: In production, send email instead of returning token
  return token;
}

/**
 * Resets a user's password using a valid reset token
 */
export async function resetPasswordWithToken(
  pool: Pool,
  token: string,
  newPassword: string
): Promise<void> {
  const tokenHash = hashValue(token);
  const resetRecord = await findActivePasswordReset(pool, tokenHash);

  if (!resetRecord) {
    throw new ServiceError('RESET_INVALID', 'Invalid or expired reset token');
  }

  // Verify token hash matches (timing-safe)
  if (!timingSafeEqual(resetRecord.tokenHash, tokenHash)) {
    throw new ServiceError('RESET_INVALID', 'Invalid or expired reset token');
  }

  // Check expiration
  if (resetRecord.expiresAt < new Date()) {
    throw new ServiceError('RESET_EXPIRED', 'Password reset token has expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(pool, resetRecord.userId, passwordHash);
  await markPasswordResetUsed(pool, resetRecord.id);
}

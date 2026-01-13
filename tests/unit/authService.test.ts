import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Pool } from 'pg';

// Mock dependencies before importing authService
const mockFindUserByEmail = jest.fn();
const mockFindUserByUsername = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUserPassword = jest.fn();
const mockCreatePasswordReset = jest.fn();
const mockFindActivePasswordReset = jest.fn();
const mockMarkPasswordResetUsed = jest.fn();

jest.unstable_mockModule('../../src/db/userRepository.js', () => ({
  findUserByEmail: mockFindUserByEmail,
  findUserByUsername: mockFindUserByUsername,
  createUser: mockCreateUser,
  updateUserPassword: mockUpdateUserPassword,
}));

jest.unstable_mockModule('../../src/db/passwordResetRepository.js', () => ({
  createPasswordReset: mockCreatePasswordReset,
  findActivePasswordReset: mockFindActivePasswordReset,
  markPasswordResetUsed: mockMarkPasswordResetUsed,
}));

// Import authService after mocks are set up
const {
  toPublicUser,
  registerUser,
  authenticateUser,
  createPasswordResetToken,
  resetPasswordWithToken,
} = await import('../../src/services/authService.js');

const { ServiceError } = await import('../../src/utils/errors.js');
const { hashPassword, verifyPassword } = await import('../../src/utils/password.js');
const { randomToken, hashValue, timingSafeEqual } = await import('../../src/utils/security.js');

// Mock pool
const mockPool = {} as Pool;

// Sample user data
const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: '$argon2id$v=19$m=19456,t=3,p=1$...',
  role: 'user' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('toPublicUser', () => {
    it('should strip sensitive fields from user object', () => {
      const user = createMockUser();
      const publicUser = toPublicUser(user);

      expect(publicUser).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        createdAt: new Date('2024-01-01'),
      });
    });

    it('should not include passwordHash in public user', () => {
      const user = createMockUser({ passwordHash: 'sensitive-hash-value' });
      const publicUser = toPublicUser(user);

      expect(publicUser).not.toHaveProperty('passwordHash');
    });

    it('should not include updatedAt in public user', () => {
      const user = createMockUser();
      const publicUser = toPublicUser(user);

      expect(publicUser).not.toHaveProperty('updatedAt');
    });

    it('should preserve admin role', () => {
      const user = createMockUser({ role: 'admin' });
      const publicUser = toPublicUser(user);

      expect(publicUser.role).toBe('admin');
    });
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const newUser = createMockUser();
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(undefined);
      mockCreateUser.mockResolvedValue(newUser);

      const result = await registerUser(mockPool, {
        email: 'test@example.com',
        username: 'testuser',
        password: 'SecurePassword123!',
      });

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        createdAt: new Date('2024-01-01'),
      });
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockPool, 'test@example.com');
      expect(mockFindUserByUsername).toHaveBeenCalledWith(mockPool, 'testuser');
      expect(mockCreateUser).toHaveBeenCalled();
    });

    it('should throw USER_EXISTS error when email already exists', async () => {
      mockFindUserByEmail.mockResolvedValue(createMockUser());

      await expect(
        registerUser(mockPool, {
          email: 'existing@example.com',
          username: 'newuser',
          password: 'Password123!',
        })
      ).rejects.toThrow(ServiceError);

      try {
        await registerUser(mockPool, {
          email: 'existing@example.com',
          username: 'newuser',
          password: 'Password123!',
        });
      } catch (error) {
        expect((error as ServiceError).code).toBe('USER_EXISTS');
        expect((error as ServiceError).message).toBe('A user with this email already exists');
      }
    });

    it('should throw USER_EXISTS error when username already exists', async () => {
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(createMockUser());

      await expect(
        registerUser(mockPool, {
          email: 'new@example.com',
          username: 'existinguser',
          password: 'Password123!',
        })
      ).rejects.toThrow(ServiceError);

      try {
        await registerUser(mockPool, {
          email: 'new@example.com',
          username: 'existinguser',
          password: 'Password123!',
        });
      } catch (error) {
        expect((error as ServiceError).code).toBe('USER_EXISTS');
        expect((error as ServiceError).message).toBe('A user with this username already exists');
      }
    });

    it('should hash password before storing', async () => {
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(undefined);
      mockCreateUser.mockResolvedValue(createMockUser());

      await registerUser(mockPool, {
        email: 'test@example.com',
        username: 'testuser',
        password: 'MyPassword123!',
      });

      // Verify createUser was called with a hashed password
      const createUserCall = mockCreateUser.mock.calls[0][1] as { passwordHash: string };
      expect(createUserCall.passwordHash).toMatch(/^\$argon2/);
      expect(createUserCall.passwordHash).not.toBe('MyPassword123!');
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user by email with valid password', async () => {
      const hashedPassword = await hashPassword('CorrectPassword123!');
      const user = createMockUser({ passwordHash: hashedPassword });
      mockFindUserByEmail.mockResolvedValue(user);

      const result = await authenticateUser(mockPool, {
        identifier: 'test@example.com',
        password: 'CorrectPassword123!',
      });

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        createdAt: new Date('2024-01-01'),
      });
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockPool, 'test@example.com');
    });

    it('should authenticate user by username with valid password', async () => {
      const hashedPassword = await hashPassword('CorrectPassword123!');
      const user = createMockUser({ passwordHash: hashedPassword });
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(user);

      const result = await authenticateUser(mockPool, {
        identifier: 'testuser',
        password: 'CorrectPassword123!',
      });

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        createdAt: new Date('2024-01-01'),
      });
      expect(mockFindUserByUsername).toHaveBeenCalledWith(mockPool, 'testuser');
    });

    it('should throw INVALID_CREDENTIALS when user not found', async () => {
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(undefined);

      await expect(
        authenticateUser(mockPool, {
          identifier: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
      ).rejects.toThrow(ServiceError);

      try {
        await authenticateUser(mockPool, {
          identifier: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        });
      } catch (error) {
        expect((error as ServiceError).code).toBe('INVALID_CREDENTIALS');
        expect((error as ServiceError).message).toBe('Invalid email/username or password');
      }
    });

    it('should throw INVALID_CREDENTIALS when password is incorrect', async () => {
      const hashedPassword = await hashPassword('CorrectPassword123!');
      const user = createMockUser({ passwordHash: hashedPassword });
      mockFindUserByEmail.mockResolvedValue(user);

      await expect(
        authenticateUser(mockPool, {
          identifier: 'test@example.com',
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow(ServiceError);

      try {
        await authenticateUser(mockPool, {
          identifier: 'test@example.com',
          password: 'WrongPassword123!',
        });
      } catch (error) {
        expect((error as ServiceError).code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should not reveal whether email or password was incorrect', async () => {
      // Both scenarios should return identical error
      mockFindUserByEmail.mockResolvedValue(undefined);
      mockFindUserByUsername.mockResolvedValue(undefined);

      try {
        await authenticateUser(mockPool, {
          identifier: 'nonexistent@example.com',
          password: 'AnyPassword',
        });
      } catch (error1) {
        mockFindUserByEmail.mockResolvedValue(
          createMockUser({ passwordHash: await hashPassword('DifferentPassword') })
        );

        try {
          await authenticateUser(mockPool, {
            identifier: 'test@example.com',
            password: 'WrongPassword',
          });
        } catch (error2) {
          // Both errors should have the same message (no user enumeration)
          expect((error1 as ServiceError).message).toBe((error2 as ServiceError).message);
        }
      }
    });
  });

  describe('createPasswordResetToken', () => {
    it('should create a reset token for existing user', async () => {
      const user = createMockUser();
      mockFindUserByEmail.mockResolvedValue(user);
      mockCreatePasswordReset.mockResolvedValue({
        id: 'reset-123',
        userId: user.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
        createdAt: new Date(),
      });

      const token = await createPasswordResetToken(mockPool, 'test@example.com');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token!.length).toBe(64); // 32 bytes = 64 hex chars
      expect(mockCreatePasswordReset).toHaveBeenCalled();
    });

    it('should return null for non-existent user without revealing info', async () => {
      mockFindUserByEmail.mockResolvedValue(undefined);

      const token = await createPasswordResetToken(mockPool, 'nonexistent@example.com');

      expect(token).toBeNull();
      expect(mockCreatePasswordReset).not.toHaveBeenCalled();
    });

    it('should store hashed token not raw token', async () => {
      const user = createMockUser();
      mockFindUserByEmail.mockResolvedValue(user);
      mockCreatePasswordReset.mockResolvedValue({
        id: 'reset-123',
        userId: user.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
        createdAt: new Date(),
      });

      const token = await createPasswordResetToken(mockPool, 'test@example.com');

      // Verify the tokenHash passed to createPasswordReset is NOT the raw token
      // createPasswordReset(pool, userId, tokenHash, expiresAt) - tokenHash is arg index 2
      const createCall = mockCreatePasswordReset.mock.calls[0];
      const storedTokenHash = createCall[2];
      expect(storedTokenHash).not.toBe(token);
      expect(storedTokenHash).toBe(hashValue(token!));
    });

    it('should set expiration based on TTL config', async () => {
      const user = createMockUser();
      mockFindUserByEmail.mockResolvedValue(user);
      mockCreatePasswordReset.mockResolvedValue({
        id: 'reset-123',
        userId: user.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
        createdAt: new Date(),
      });

      const beforeCall = Date.now();
      await createPasswordResetToken(mockPool, 'test@example.com');
      const afterCall = Date.now();

      // createPasswordReset(pool, userId, tokenHash, expiresAt) - expiresAt is arg index 3
      const createCall = mockCreatePasswordReset.mock.calls[0];
      const expiresAt = createCall[3] as Date;

      // Default TTL is 30 minutes
      const expectedMinExpiry = beforeCall + 30 * 60 * 1000;
      const expectedMaxExpiry = afterCall + 30 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry);
    });
  });

  describe('resetPasswordWithToken', () => {
    it('should successfully reset password with valid token', async () => {
      const token = randomToken(32);
      const tokenHash = hashValue(token);
      const resetRecord = {
        id: 'reset-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Valid for 30 more minutes
        used: false,
        createdAt: new Date(),
      };
      mockFindActivePasswordReset.mockResolvedValue(resetRecord);
      mockUpdateUserPassword.mockResolvedValue(undefined);
      mockMarkPasswordResetUsed.mockResolvedValue(undefined);

      await expect(
        resetPasswordWithToken(mockPool, token, 'NewPassword123!')
      ).resolves.toBeUndefined();

      expect(mockUpdateUserPassword).toHaveBeenCalled();
      expect(mockMarkPasswordResetUsed).toHaveBeenCalledWith(mockPool, 'reset-123');
    });

    it('should throw RESET_INVALID for invalid token', async () => {
      mockFindActivePasswordReset.mockResolvedValue(undefined);

      await expect(
        resetPasswordWithToken(mockPool, 'invalid-token', 'NewPassword123!')
      ).rejects.toThrow(ServiceError);

      try {
        await resetPasswordWithToken(mockPool, 'invalid-token', 'NewPassword123!');
      } catch (error) {
        expect((error as ServiceError).code).toBe('RESET_INVALID');
        expect((error as ServiceError).message).toBe('Invalid or expired reset token');
      }
    });

    it('should throw RESET_EXPIRED for expired token', async () => {
      const token = randomToken(32);
      const tokenHash = hashValue(token);
      const resetRecord = {
        id: 'reset-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        used: false,
        createdAt: new Date(),
      };
      mockFindActivePasswordReset.mockResolvedValue(resetRecord);

      await expect(
        resetPasswordWithToken(mockPool, token, 'NewPassword123!')
      ).rejects.toThrow(ServiceError);

      try {
        await resetPasswordWithToken(mockPool, token, 'NewPassword123!');
      } catch (error) {
        expect((error as ServiceError).code).toBe('RESET_EXPIRED');
        expect((error as ServiceError).message).toBe('Password reset token has expired');
      }
    });

    it('should hash the new password before storing', async () => {
      const token = randomToken(32);
      const tokenHash = hashValue(token);
      const resetRecord = {
        id: 'reset-123',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
        createdAt: new Date(),
      };
      mockFindActivePasswordReset.mockResolvedValue(resetRecord);
      mockUpdateUserPassword.mockResolvedValue(undefined);
      mockMarkPasswordResetUsed.mockResolvedValue(undefined);

      await resetPasswordWithToken(mockPool, token, 'NewSecurePassword123!');

      const updateCall = mockUpdateUserPassword.mock.calls[0];
      const newPasswordHash = updateCall[2] as string;
      expect(newPasswordHash).toMatch(/^\$argon2/);
      expect(newPasswordHash).not.toBe('NewSecurePassword123!');
    });

    it('should mark token as used after successful reset', async () => {
      const token = randomToken(32);
      const tokenHash = hashValue(token);
      const resetRecord = {
        id: 'reset-456',
        userId: 'user-123',
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        used: false,
        createdAt: new Date(),
      };
      mockFindActivePasswordReset.mockResolvedValue(resetRecord);
      mockUpdateUserPassword.mockResolvedValue(undefined);
      mockMarkPasswordResetUsed.mockResolvedValue(undefined);

      await resetPasswordWithToken(mockPool, token, 'NewPassword123!');

      expect(mockMarkPasswordResetUsed).toHaveBeenCalledWith(mockPool, 'reset-456');
    });
  });
});

describe('Security Utilities', () => {
  describe('randomToken', () => {
    it('should generate token of correct length (default 32 bytes = 64 hex chars)', () => {
      const token = randomToken();
      expect(token).toHaveLength(64);
    });

    it('should generate token of specified size', () => {
      const token16 = randomToken(16);
      const token64 = randomToken(64);
      expect(token16).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(token64).toHaveLength(128); // 64 bytes = 128 hex chars
    });

    it('should generate valid hexadecimal string', () => {
      const token = randomToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(randomToken());
      }
      expect(tokens.size).toBe(100); // All unique
    });

    it('should generate cryptographically random tokens', () => {
      // Statistical test: tokens should have good entropy
      const token = randomToken(32);
      const uniqueChars = new Set(token.split('')).size;
      // A 64-char hex string should have reasonable character variety
      expect(uniqueChars).toBeGreaterThan(8);
    });
  });

  describe('hashValue', () => {
    it('should produce consistent hash for same input', () => {
      const hash1 = hashValue('test-string');
      const hash2 = hashValue('test-string');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashValue('string-a');
      const hash2 = hashValue('string-b');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string (SHA256)', () => {
      const hash = hashValue('any-input');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle empty string', () => {
      const hash = hashValue('');
      expect(hash).toHaveLength(64);
      // SHA256 of empty string is known value
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode characters', () => {
      const hash = hashValue('Hello 世界 🌍');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should be case-sensitive', () => {
      const hashLower = hashValue('hello');
      const hashUpper = hashValue('HELLO');
      expect(hashLower).not.toBe(hashUpper);
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for equal strings', () => {
      expect(timingSafeEqual('hello', 'hello')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(timingSafeEqual('hello', 'world')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(timingSafeEqual('short', 'muchlongerstring')).toBe(false);
    });

    it('should return true for empty strings', () => {
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('should handle unicode characters', () => {
      expect(timingSafeEqual('Hello 世界', 'Hello 世界')).toBe(true);
      expect(timingSafeEqual('Hello 世界', 'Hello 世界!')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(timingSafeEqual('Hello', 'hello')).toBe(false);
    });

    it('should handle special characters', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(timingSafeEqual(special, special)).toBe(true);
    });

    it('should detect single character difference', () => {
      expect(timingSafeEqual('password1', 'password2')).toBe(false);
    });
  });
});

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should produce argon2id hash', async () => {
      const hash = await hashPassword('MyPassword123!');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for same password (salt)', async () => {
      const hash1 = await hashPassword('SamePassword');
      const hash2 = await hashPassword('SamePassword');
      expect(hash1).not.toBe(hash2); // Different salts
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const hash = await hashPassword(longPassword);
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should handle unicode passwords', async () => {
      const hash = await hashPassword('密码123');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should handle special characters', async () => {
      const hash = await hashPassword('P@$$w0rd!#$%^&*()');
      expect(hash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword('CorrectPassword');
      const isValid = await verifyPassword(hash, 'WrongPassword');
      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const isValid = await verifyPassword('not-a-valid-hash', 'password');
      expect(isValid).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const isValid = await verifyPassword('', 'password');
      expect(isValid).toBe(false);
    });

    it('should handle unicode passwords', async () => {
      const password = '我的密码123!';
      const hash = await hashPassword(password);
      expect(await verifyPassword(hash, password)).toBe(true);
      expect(await verifyPassword(hash, 'wrong')).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const hash = await hashPassword('CaseSensitive');
      expect(await verifyPassword(hash, 'CaseSensitive')).toBe(true);
      expect(await verifyPassword(hash, 'casesensitive')).toBe(false);
      expect(await verifyPassword(hash, 'CASESENSITIVE')).toBe(false);
    });

    it('should detect whitespace differences', async () => {
      const hash = await hashPassword('password');
      expect(await verifyPassword(hash, ' password')).toBe(false);
      expect(await verifyPassword(hash, 'password ')).toBe(false);
      expect(await verifyPassword(hash, 'pass word')).toBe(false);
    });
  });
});

describe('ServiceError', () => {
  it('should create error with code and message', () => {
    const error = new ServiceError('USER_EXISTS', 'User already exists');
    expect(error.code).toBe('USER_EXISTS');
    expect(error.message).toBe('User already exists');
    expect(error.name).toBe('ServiceError');
  });

  it('should use code as message if message not provided', () => {
    const error = new ServiceError('INVALID_CREDENTIALS');
    expect(error.message).toBe('INVALID_CREDENTIALS');
  });

  it('should default to status code 400', () => {
    const error = new ServiceError('USER_EXISTS', 'message');
    expect(error.statusCode).toBe(400);
  });

  it('should allow custom status code', () => {
    const error = new ServiceError('INVALID_CREDENTIALS', 'Unauthorized', 401);
    expect(error.statusCode).toBe(401);
  });

  it('should be an instance of Error', () => {
    const error = new ServiceError('USER_EXISTS', 'message');
    expect(error).toBeInstanceOf(Error);
  });
});

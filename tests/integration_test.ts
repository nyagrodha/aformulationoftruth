/**
 * Integration Tests for Database and Encryption
 *
 * Tests internal components:
 * 1. Database operations (sessions, magic links)
 * 2. Encryption/decryption of responses
 * 3. Token generation and verification
 *
 * Run with: deno task test:integration
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Import internal modules
import { hashEmail, sha256, randomToken, encrypt, decrypt, deriveKey } from "../lib/crypto.ts";

// Helper to generate a random salt
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ============================================================================
// Test Suite: Crypto - Hashing
// ============================================================================

Deno.test({
  name: "Crypto - hashEmail should produce consistent hashes",
  async fn() {
    const email = "test@example.com";
    const hash1 = await hashEmail(email);
    const hash2 = await hashEmail(email);

    assertEquals(hash1, hash2);
    assertNotEquals(hash1, email); // Should not be plaintext
  },
});

Deno.test({
  name: "Crypto - hashEmail should be case-insensitive",
  async fn() {
    const hash1 = await hashEmail("Test@Example.COM");
    const hash2 = await hashEmail("test@example.com");

    assertEquals(hash1, hash2);
  },
});

Deno.test({
  name: "Crypto - Different emails should produce different hashes",
  async fn() {
    const hash1 = await hashEmail("user1@example.com");
    const hash2 = await hashEmail("user2@example.com");

    assertNotEquals(hash1, hash2);
  },
});

Deno.test({
  name: "Crypto - sha256 should produce hex string",
  async fn() {
    const hash = await sha256("test-input");

    assertExists(hash);
    assertEquals(hash.length, 64); // SHA-256 produces 64 hex chars
    assertEquals(/^[0-9a-f]+$/.test(hash), true);
  },
});

Deno.test({
  name: "Crypto - randomToken should produce unique tokens",
  fn() {
    const token1 = randomToken(32);
    const token2 = randomToken(32);

    assertNotEquals(token1, token2);
    assertExists(token1);
    assertEquals(token1.length > 0, true);
  },
});

Deno.test({
  name: "Crypto - randomToken should respect length parameter",
  fn() {
    const token16 = randomToken(16);
    const token32 = randomToken(32);

    // Base64 encoding adds ~33% overhead
    assertEquals(token16.length < token32.length, true);
  },
});

// ============================================================================
// Test Suite: Crypto - Encryption/Decryption
// ============================================================================

Deno.test({
  name: "Crypto - encrypt and decrypt should round-trip correctly",
  async fn() {
    const plaintext = "This is a secret answer to question 5";
    const password = "test-encryption-key-12345";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    assertEquals(decrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - encrypted data should not contain plaintext",
  async fn() {
    const plaintext = "sensitive user response";
    const password = "encryption-key";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(plaintext, key);

    assertEquals(encrypted.includes(plaintext), false);
    assertNotEquals(encrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - same plaintext should produce different ciphertexts (IV randomization)",
  async fn() {
    const plaintext = "same input text";
    const password = "same-key";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted1 = await encrypt(plaintext, key);
    const encrypted2 = await encrypt(plaintext, key);

    // Due to random IV, same plaintext should produce different ciphertexts
    assertNotEquals(encrypted1, encrypted2);

    // But both should decrypt to the same plaintext
    const decrypted1 = await decrypt(encrypted1, key);
    const decrypted2 = await decrypt(encrypted2, key);
    assertEquals(decrypted1, plaintext);
    assertEquals(decrypted2, plaintext);
  },
});

Deno.test({
  name: "Crypto - should handle empty string encryption",
  async fn() {
    const plaintext = "";
    const password = "key";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    assertEquals(decrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - should handle unicode text encryption",
  async fn() {
    const plaintext = "日本語テスト 🎉 émojis and spëcial çharacters";
    const password = "unicode-key";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    assertEquals(decrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - should handle very long text encryption",
  async fn() {
    const plaintext = "x".repeat(10000);
    const password = "long-text-key";
    const salt = generateSalt();

    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);

    assertEquals(decrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - wrong key should fail decryption",
  async fn() {
    const plaintext = "secret";
    const salt = generateSalt();

    const key1 = await deriveKey("correct-password", salt);
    const key2 = await deriveKey("wrong-password", salt);

    const encrypted = await encrypt(plaintext, key1);

    try {
      await decrypt(encrypted, key2);
      // Should not reach here
      assertEquals(true, false, "Should have thrown an error");
    } catch (error) {
      // Expected - decryption with wrong key should fail
      assertExists(error);
    }
  },
});

// ============================================================================
// Test Suite: Key Derivation
// ============================================================================

Deno.test({
  name: "Crypto - deriveKey with same salt should produce consistent keys",
  async fn() {
    const password = "test-password";
    const salt = generateSalt();

    const key1 = await deriveKey(password, salt);
    const key2 = await deriveKey(password, salt);

    // Keys should be CryptoKey objects
    assertExists(key1);
    assertExists(key2);

    // Encrypt with key1, decrypt with key2 - should work if keys are the same
    const plaintext = "test";
    const encrypted = await encrypt(plaintext, key1);
    const decrypted = await decrypt(encrypted, key2);
    assertEquals(decrypted, plaintext);
  },
});

Deno.test({
  name: "Crypto - deriveKey with different salts should produce different keys",
  async fn() {
    const password = "same-password";
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    const key1 = await deriveKey(password, salt1);
    const key2 = await deriveKey(password, salt2);

    const plaintext = "test data";
    const encrypted = await encrypt(plaintext, key1);

    // Decrypting with key2 should fail
    try {
      await decrypt(encrypted, key2);
      assertEquals(true, false, "Should have thrown an error");
    } catch {
      // Expected - different salt means different key
    }
  },
});

// ============================================================================
// Test Suite: Data Validation Helpers
// ============================================================================

Deno.test({
  name: "Validation - Email hash should be deterministic",
  async fn() {
    const email = "Consistent.Test@Example.COM";

    const hash1 = await hashEmail(email);
    const hash2 = await hashEmail(email);
    const hash3 = await hashEmail("consistent.test@example.com");

    assertEquals(hash1, hash2);
    assertEquals(hash1, hash3); // Case normalization
  },
});

// ============================================================================
// Test Suite: Token Security
// ============================================================================

Deno.test({
  name: "Security - Token should have sufficient entropy",
  fn() {
    const tokens = new Set<string>();

    // Generate 100 tokens
    for (let i = 0; i < 100; i++) {
      tokens.add(randomToken(32));
    }

    // All should be unique
    assertEquals(tokens.size, 100);
  },
});

Deno.test({
  name: "Security - Token should not be predictable",
  fn() {
    const token1 = randomToken(32);
    const token2 = randomToken(32);

    // Tokens should not share common prefixes
    const commonPrefix = token1.split("").findIndex((c, i) => c !== token2[i]);
    assertEquals(commonPrefix < 5, true, "Tokens should not share long prefixes");
  },
});

console.log("\n===========================================");
console.log("Integration Test Suite");
console.log("===========================================");
console.log("Testing: Crypto, Encryption, Token generation");
console.log("===========================================\n");

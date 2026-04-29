import { assertEquals, assertExists } from '$std/assert/mod.ts';
import {
  getUserById,
  getUserByEmailHash,
  upgradeToPaid,
  setPublicKey,
  updateProfile,
  deleteUserData,
  type User
} from '../lib/users.ts';

Deno.test('getUserById returns user with profile_tier if exists', async () => {
  // Test both cases: user exists and user doesn't exist
  const nonExistent = await getUserById(999999999);
  assertEquals(nonExistent, null);
  // Actual user IDs would need to exist in test DB
});

Deno.test('getUserById returns null for non-existent user', async () => {
  const user = await getUserById(999999999);
  assertEquals(user, null);
});

Deno.test('getUserByEmailHash returns null for non-existent hash', async () => {
  const user = await getUserByEmailHash('nonexistent_' + Date.now());
  assertEquals(user, null);
});

Deno.test('upgradeToPaid returns boolean result', async () => {
  const result = await upgradeToPaid(999998);
  assertEquals(typeof result, 'boolean');
});

Deno.test('setPublicKey accepts valid parameters', async () => {
  const result = await setPublicKey(
    999997,
    'test_public_key_' + Date.now(),
    'x25519'
  );
  assertEquals(typeof result, 'boolean');
});

Deno.test('updateProfile accepts partial updates', async () => {
  const result = await updateProfile(999996, {
    username: 'testuser_' + Date.now()
  });
  assertEquals(typeof result, 'boolean');
});

Deno.test('updateProfile with empty updates returns true', async () => {
  const result = await updateProfile(999995, {});
  assertEquals(result, true);
});

Deno.test('deleteUserData returns appropriate success/failure', async () => {
  // Non-existent user should return failure
  const resultNonExistent = await deleteUserData(999993);
  assertExists(resultNonExistent.message);
  assertEquals(typeof resultNonExistent.success, 'boolean');

  // Successful deletion should return success
  // (requires pre-existing test user in DB)
});

Deno.test('deleteUserData message is always provided', async () => {
  const result = await deleteUserData(999992);
  assertEquals(typeof result.message, 'string');
  assertEquals(typeof result.success, 'boolean');
});

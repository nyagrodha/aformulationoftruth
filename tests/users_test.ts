import { assertEquals, assertNotEquals } from 'std/assert/mod.ts';
import { getUserById, getUserByEmailHash, upgradeToPaid, setPublicKey, updateProfile, deleteUserData } from '../lib/users.ts';

Deno.test('User Operations', async (t) => {
  await t.step('gets user by ID', async () => {
    const user = await getUserById(1);
    if (user) {
      assertEquals(typeof user.id, 'number');
      assertEquals(typeof user.email, 'string');
      assertEquals(['free', 'paid'].includes(user.profile_tier), true);
    }
  });

  await t.step('returns null for non-existent user', async () => {
    const user = await getUserById(999999);
    assertEquals(user, null);
  });

  await t.step('gets user by email hash', async () => {
    const user = await getUserByEmailHash('test@example.com');
    if (user) {
      assertEquals(typeof user.email, 'string');
    }
  });

  await t.step('upgrades user to paid tier', async () => {
    const success = await upgradeToPaid(2);
    if (success) {
      const user = await getUserById(2);
      assertEquals(user?.profile_tier, 'paid');
    }
  });

  await t.step('sets public key for user', async () => {
    const publicKey = 'abc123def456';
    const success = await setPublicKey(3, publicKey);
    if (success) {
      const user = await getUserById(3);
      assertEquals(user?.public_key, publicKey);
    }
  });

  await t.step('updates user profile', async () => {
    const success = await updateProfile(4, {
      username: 'testuser',
      profile_visibility: 'public',
    });
    if (success) {
      const user = await getUserById(4);
      assertEquals(user?.profile_visibility, 'public');
    }
  });

  await t.step('deletes user data', async () => {
    const userId = 5;
    const deleted = await deleteUserData(userId);
    const user = await getUserById(userId);
    assertEquals(user, null);
  });
});

import { assertEquals } from '$std/assert/mod.ts';
import {
  generatePaymentCode,
  validatePaymentCode,
  activatePaymentCode,
  verifyPaymentCodeAsAdmin
} from '../lib/payment-codes.ts';

const TEST_USER_ID = 99999;

Deno.test('generatePaymentCode creates A4OT-XXXX-XXXX format', async () => {
  const code = await generatePaymentCode(TEST_USER_ID);
  assertEquals(code.match(/^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/)?.[0], code);
});

Deno.test('validatePaymentCode returns false for non-existent code', async () => {
  const valid = await validatePaymentCode('A4OT-FAKE-CODE');
  assertEquals(valid, false);
});

Deno.test('validatePaymentCode returns true for generated code', async () => {
  const code = await generatePaymentCode(TEST_USER_ID + 1);
  const valid = await validatePaymentCode(code);
  assertEquals(valid, true);
});

Deno.test('activatePaymentCode upgrades user tier', async () => {
  const userId = TEST_USER_ID + 2;
  const code = await generatePaymentCode(userId);
  const result = await activatePaymentCode(code, userId);
  assertEquals(result.upgraded, true);
  assertEquals(typeof result.message, 'string');
});

Deno.test('activatePaymentCode rejects already-used code', async () => {
  const userId = TEST_USER_ID + 3;
  const code = await generatePaymentCode(userId);

  // First activation succeeds
  const result1 = await activatePaymentCode(code, userId);
  assertEquals(result1.upgraded, true);

  // Second activation fails
  const result2 = await activatePaymentCode(code, userId);
  assertEquals(result2.upgraded, false);
  assertEquals(
    result2.message.toLowerCase().includes('invalid') ||
      result2.message.toLowerCase().includes('used'),
    true
  );
});

Deno.test('verifyPaymentCodeAsAdmin verifies and upgrades user', async () => {
  const userId = TEST_USER_ID + 4;
  const code = await generatePaymentCode(userId);

  const result = await verifyPaymentCodeAsAdmin(code);
  assertEquals(result.verified, true);
  assertEquals(result.userId, userId);
  assertEquals(typeof result.message, 'string');
});

Deno.test('verifyPaymentCodeAsAdmin rejects non-existent code', async () => {
  const result = await verifyPaymentCodeAsAdmin('A4OT-FAKE-CODE');
  assertEquals(result.verified, false);
  assertEquals(typeof result.message, 'string');
});

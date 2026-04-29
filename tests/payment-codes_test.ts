import { assertEquals, assertStringIncludes } from 'std/assert/mod.ts';
import { generatePaymentCode, validatePaymentCode, activatePaymentCode, verifyPaymentCodeAsAdmin } from '../lib/payment-codes.ts';

Deno.test('Payment Code Generation', async (t) => {
  await t.step('generates code in A4OT-XXXX-XXXX format', async () => {
    const code = await generatePaymentCode(1);
    const pattern = /^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    assertEquals(pattern.test(code), true);
  });

  await t.step('generates unique codes on retry', async () => {
    const code1 = await generatePaymentCode(2);
    const code2 = await generatePaymentCode(3);
    assertEquals(code1 !== code2, true);
  });
});

Deno.test('Payment Code Validation', async (t) => {
  await t.step('validates newly generated code', async () => {
    const code = await generatePaymentCode(4);
    const isValid = await validatePaymentCode(code);
    assertEquals(isValid, true);
  });

  await t.step('rejects non-existent code', async () => {
    const isValid = await validatePaymentCode('A4OT-XXXX-XXXX');
    assertEquals(isValid, false);
  });
});

Deno.test('Payment Code Activation', async (t) => {
  await t.step('successfully activates valid code', async () => {
    const userId = 5;
    const code = await generatePaymentCode(userId);
    const result = await activatePaymentCode(code, userId);
    assertEquals(result.success, true);
    assertStringIncludes(result.message, 'successfully');
  });

  await t.step('rejects already-used codes', async () => {
    const userId = 6;
    const code = await generatePaymentCode(userId);
    await activatePaymentCode(code, userId);
    const result = await activatePaymentCode(code, userId);
    assertEquals(result.success, false);
  });

  await t.step('rejects invalid codes', async () => {
    const result = await activatePaymentCode('A4OT-XXXX-XXXX', 7);
    assertEquals(result.success, false);
  });
});

Deno.test('Admin Payment Verification', async (t) => {
  await t.step('admin can verify unverified code', async () => {
    const code = await generatePaymentCode(8);
    const result = await verifyPaymentCodeAsAdmin(code);
    assertEquals(result.success, true);
  });

  await t.step('admin rejects already-verified codes', async () => {
    const code = await generatePaymentCode(9);
    await verifyPaymentCodeAsAdmin(code);
    const result = await verifyPaymentCodeAsAdmin(code);
    assertEquals(result.success, false);
  });
});

/**
 * The keystore and its two expiry clocks.
 *
 * Run: deno test --allow-read --allow-write romania/
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { loadIdentity, markDelivered, shredExpired, shredIdentity, storeIdentity, touchActivity } from '../keystore.ts';

const ID = '11111111-2222-3333-4444-555555555555';
const POLICY = { afterDelivery: 7, absolute: 30 };
const tmp = () => Deno.makeTempDir({ prefix: 'keystore-test-' });
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

Deno.test('storeIdentity - writes 0600 and round-trips', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'AGE-SECRET-KEY-1TEST');
  assertEquals(await loadIdentity(dir, ID), 'AGE-SECRET-KEY-1TEST');
  const info = await Deno.stat(`${dir}/${ID}.key`);
  assertEquals(info.mode! & 0o777, 0o600, 'identity must not be group/world readable');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('storeIdentity - rejects a session id containing path separators', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, '../escape', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredIdentity - removes the key and its markers', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, new Date());
  await touchActivity(dir, ID, new Date());
  await shredIdentity(dir, ID);
  assertEquals([...Deno.readDirSync(dir)].length, 0, 'markers must go with the key');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - keeps a delivered key inside its window', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, new Date());
  assertEquals(await shredExpired(dir, days(5), POLICY), 0);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - destroys a delivered key past its window', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, new Date());
  assertEquals(await shredExpired(dir, days(8), POLICY), 1);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('markDelivered - a re-send never extends the clock', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, new Date());
  await markDelivered(dir, ID, days(6)); // a re-send on day 6
  assertEquals(await shredExpired(dir, days(8), POLICY), 1, 'the first send is what counts');
  await Deno.remove(dir, { recursive: true });
});

// The reason the ceiling is measured from activity rather than key creation:
// someone who answers a few questions, closes the tab, and comes back weeks
// later has not abandoned anything, and their key must survive the gap.
Deno.test('shredExpired - a slow respondent keeps their key while still working', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await touchActivity(dir, ID, days(29)); // came back on day 29
  // Day 40 is well past 30 days from minting, but only 11 from last activity.
  assertEquals(await shredExpired(dir, days(40), POLICY), 0, 'must not collect a key mid-questionnaire');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - but a truly abandoned key still dies', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await touchActivity(dir, ID, new Date());
  assertEquals(await shredExpired(dir, days(31), POLICY), 1);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - an undelivered, untouched key dies at the ceiling', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  assertEquals(await shredExpired(dir, days(31), POLICY), 1);
  await Deno.remove(dir, { recursive: true });
});

// NaN comparisons are always false, so an unparseable stamp would make a key
// immortal -- defeating the ceiling that exists to prevent exactly that.
Deno.test('shredExpired - a corrupt marker does not confer immortality', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await Deno.writeTextFile(`${dir}/${ID}.delivered`, 'not a date', { mode: 0o600 });
  await Deno.writeTextFile(`${dir}/${ID}.seen`, 'also not a date', { mode: 0o600 });
  assertEquals(await shredExpired(dir, days(31), POLICY), 1);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - ignores files that are not keys', async () => {
  const dir = await tmp();
  await Deno.writeTextFile(`${dir}/notes.txt`, 'x');
  assertEquals(await shredExpired(dir, days(999), POLICY), 0);
  assert([...Deno.readDirSync(dir)].length === 1, 'unrelated files must be left alone');
  await Deno.remove(dir, { recursive: true });
});

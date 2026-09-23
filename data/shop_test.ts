import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { AMAZON_TAG, BOOKS, buildAmazonUrl, buildPenguinUrl, isbn13to10, OWN_ITEMS, SHOP_ITEMS } from './shop.ts';

Deno.test('buildAmazonUrl appends the configured Associates tag', () => {
  assertEquals(AMAZON_TAG, 'a4mulasatya-20');
  assertEquals(
    buildAmazonUrl('9780142437964'),
    'https://www.amazon.com/dp/0142437964?tag=a4mulasatya-20',
  );
});

Deno.test('isbn13to10 reproduces all eight shop ISBN-10s', () => {
  const testCases = [
    ['9780142437964', '0142437964'],
    ['9780143039075', '0143039075'],
    ['9780143039228', '0143039229'],
    ['9780143039310', '0143039318'],
    ['9780143133599', '0143133594'],
    ['9780143133704', '0143133705'],
    ['9780143133711', '0143133713'],
    ['9780679779155', '0679779159'],
  ];
  for (const [isbn13, expected10] of testCases) {
    assertEquals(isbn13to10(isbn13), expected10);
  }
});

Deno.test('isbn13to10 handles the standard textbook example', () => {
  assertEquals(isbn13to10('9780306406157'), '0306406152');
});

Deno.test('isbn13to10 handles X check digit', () => {
  assertEquals(isbn13to10('9780804429573'), '080442957X');
});

Deno.test('isbn13to10 returns null for 979 prefix', () => {
  assertEquals(isbn13to10('9791032305690'), null);
});

Deno.test('isbn13to10 returns null for malformed input', () => {
  assertEquals(isbn13to10('123'), null);
  assertEquals(isbn13to10('97801424379'), null);
});

Deno.test('buildAmazonUrl with 979 prefix falls back to search', () => {
  const url = buildAmazonUrl('9791032305690');
  assertStringIncludes(url, 'https://www.amazon.com/s?k=9791032305690');
  assertStringIncludes(url, `tag=${AMAZON_TAG}`);
});

Deno.test('every book carries the Associates tag on its Amazon link', () => {
  for (const item of BOOKS) {
    if (item.kind !== 'affiliate') continue;
    const amazon = item.links.find((l) => l.retailer === 'Amazon');
    assertStringIncludes(amazon!.url, `tag=${AMAZON_TAG}`);
  }
});

Deno.test('every book Amazon URL matches the ISBN-10 ASIN pattern', () => {
  for (const item of BOOKS) {
    if (item.kind !== 'affiliate') continue;
    const amazon = item.links.find((l) => l.retailer === 'Amazon');
    assertStringIncludes(amazon!.url, 'https://www.amazon.com/dp/');
    assertStringIncludes(amazon!.url, '?tag=');
    // Verify the ASIN is 10 digits (ISBN-10 format)
    const asinMatch = amazon!.url.match(/\/dp\/([0-9]{9}[0-9X])\?/);
    assertEquals(asinMatch !== null, true);
  }
});

Deno.test('buildPenguinUrl points at the PRH ISBN lookup', () => {
  assertStringIncludes(buildPenguinUrl('9780142437964'), '9780142437964');
  assertStringIncludes(
    buildPenguinUrl('9780142437964'),
    'penguinrandomhouse.com',
  );
});

Deno.test('catalog contains all seven Proust volumes plus de Botton', () => {
  assertEquals(BOOKS.length, 8);
  const volumes = BOOKS.filter((b) => b.kind === 'affiliate' && b.volume !== undefined);
  assertEquals(volumes.length, 7);
});

Deno.test('every book offers Penguin first and Amazon second', () => {
  for (const book of BOOKS) {
    if (book.kind !== 'affiliate') continue;
    assertEquals(book.links[0].retailer, 'Penguin');
    assertEquals(book.links[1].retailer, 'Amazon');
  }
});

Deno.test('own items carry live Stripe Payment Links', () => {
  assertEquals(OWN_ITEMS.length, 2);
  const expectedPrices = new Map([
    ['Abhinava-Tee', '$48'],
    ['Abhinavabsurd… yet funny!', '$49'],
  ]);
  for (const item of OWN_ITEMS) {
    if (item.kind !== 'own') continue;
    assertStringIncludes(item.paymentLink, 'https://buy.stripe.com/');
    assertEquals(item.price, expectedPrices.get(item.title));
  }
});

Deno.test('SHOP_ITEMS is books followed by own items', () => {
  assertEquals(SHOP_ITEMS.length, 10);
});

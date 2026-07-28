import { assertEquals, assertStringIncludes } from "$std/assert/mod.ts";
import {
  AMAZON_TAG,
  BOOKS,
  buildAmazonUrl,
  buildPenguinUrl,
  OWN_ITEMS,
  SHOP_ITEMS,
} from "./shop.ts";

Deno.test("buildAmazonUrl omits the tag parameter when AMAZON_TAG is empty", () => {
  assertEquals(AMAZON_TAG, "");
  assertEquals(
    buildAmazonUrl("9780142437964"),
    "https://www.amazon.com/dp/9780142437964",
  );
});

Deno.test("buildPenguinUrl points at the PRH ISBN lookup", () => {
  assertStringIncludes(buildPenguinUrl("9780142437964"), "9780142437964");
  assertStringIncludes(
    buildPenguinUrl("9780142437964"),
    "penguinrandomhouse.com",
  );
});

Deno.test("catalog contains all seven Proust volumes plus de Botton", () => {
  assertEquals(BOOKS.length, 8);
  const volumes = BOOKS.filter((b) =>
    b.kind === "affiliate" && b.volume !== undefined
  );
  assertEquals(volumes.length, 7);
});

Deno.test("every book offers Penguin first and Amazon second", () => {
  for (const book of BOOKS) {
    if (book.kind !== "affiliate") continue;
    assertEquals(book.links[0].retailer, "Penguin");
    assertEquals(book.links[1].retailer, "Amazon");
  }
});

Deno.test("own items carry live Stripe Payment Links", () => {
  assertEquals(OWN_ITEMS.length, 2);
  for (const item of OWN_ITEMS) {
    if (item.kind !== "own") continue;
    assertStringIncludes(item.paymentLink, "https://buy.stripe.com/");
    assertEquals(item.price, "$35");
  }
});

Deno.test("SHOP_ITEMS is books followed by own items", () => {
  assertEquals(SHOP_ITEMS.length, 10);
});

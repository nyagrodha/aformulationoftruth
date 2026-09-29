/**
 * The generated ray data must describe the generated images. Both come out of
 * tools/compose-nav-rays.py; regenerating one without the other would float the
 * labels off their rays, and nothing visual would catch it in review.
 */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { NAV_RAYS } from './nav-rays.ts';

/** Width and height from a WebP header (VP8X, VP8L or VP8 ). */
function webpSize(b: Uint8Array): [number, number] {
  const tag = new TextDecoder().decode(b.slice(12, 16));
  if (tag === 'VP8X') {
    return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  }
  if (tag === 'VP8L') {
    const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  if (tag === 'VP8 ') return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  throw new Error(`unknown webp chunk ${tag}`);
}

Deno.test('nav rays - seven rays, left to right, tips inside the box', () => {
  assertEquals(NAV_RAYS.rays.length, 7);
  for (let i = 1; i < 7; i++) assert(NAV_RAYS.rays[i].angle < NAV_RAYS.rays[i - 1].angle, 'left to right');
  for (const r of NAV_RAYS.rays) {
    assert(r.x > 0 && r.x < 100 && r.y > 0 && r.y < 100, `tip ${r.x},${r.y} outside the box`);
    assert(['left', 'right', 'below'].includes(r.side));
  }
});

Deno.test('nav rays - image size matches the data, at 3x', async () => {
  for (const url of [NAV_RAYS.light, NAV_RAYS.dark]) {
    const bytes = await Deno.readFile(`public${url}`);
    assertEquals(webpSize(bytes), [NAV_RAYS.width * 3, NAV_RAYS.height * 3], url);
  }
});

/*
 * Size alone cannot catch drift: ray length, spread and the mark's size all move
 * the tips without changing the image's dimensions. The generator records each
 * image's sha256 beside the tips it computed; an image regenerated without its
 * data, or data without its images, no longer matches.
 */
Deno.test('nav rays - the committed images are the ones these tips were computed for', async () => {
  for (const [name, url] of [['light', NAV_RAYS.light], ['dark', NAV_RAYS.dark]] as const) {
    const bytes = await Deno.readFile(`public${url}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    assertEquals(hex, NAV_RAYS.sha256[name], `${url} was regenerated without data/nav-rays.ts, or the reverse`);
  }
});

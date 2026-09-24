/**
 * Minimal greyscale PNG encoder.
 *
 * Exists for lib/captcha.ts, which must draw its challenge as a raster image:
 * Tor Browser's "Safest" level disables SVG, and the gate has to work there
 * with JavaScript off. There is no image library in the import map and adding
 * one for a single 8-bit greyscale bitmap is not worth the supply chain, so
 * this writes the format by hand: signature, IHDR, one IDAT, IEND.
 *
 * The IDAT payload is a zlib stream. `CompressionStream('deflate')` produces
 * exactly that (RFC 1950, header and Adler-32 included), which is what PNG
 * requires -- 'deflate-raw' would not be.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typeAndData = out.subarray(4, 8 + data.length);
  for (let i = 0; i < 4; i++) typeAndData[i] = type.charCodeAt(i);
  typeAndData.set(data, 4);
  view.setUint32(8 + data.length, crc32(typeAndData));
  return out;
}

async function zlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encode an 8-bit greyscale bitmap, row-major, one byte per pixel.
 */
export async function encodeGreyscalePng(width: number, height: number, pixels: Uint8Array): Promise<Uint8Array> {
  if (pixels.length !== width * height) throw new RangeError('pixel buffer does not match dimensions');

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  // compression, filter, interlace: all 0

  // Each scanline is prefixed with its filter type; 0 (None) throughout.
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

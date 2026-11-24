/**
 * @file Reads the pixel size of an image from its leading bytes: PNG, JPEG,
 * GIF and WebP from their native headers, SVG from its `viewBox` or its
 * `width` and `height` attributes.
 *
 * Ported from lmaa.space `apps/backend/src/lib/og.ts`. Pure functions with no
 * network access, used by the preview reader and the sponsor picture copy.
 */

// === Image header probe ===
// Parses the native header bytes of common web image formats and returns the
// real pixel dimensions. Designed to work on the first ~32 KB of a file. The
// byte offsets and marker values below are those the format specifications
// define, each named in the comment beside it.

/**
 * Parses image dimensions from the header bytes of PNG, JPEG, GIF and WebP files.
 *
 * @param buf - Raw bytes of an image. The first few KB are sufficient for all supported formats.
 * @returns `{ width, height }` in pixels, or `null` when the format is unrecognised or malformed.
 */
export function parseImageDimensions(buf: Uint8Array): { width: number; height: number } | null {
  // PNG: 8-byte signature, then 4-byte chunk length, "IHDR", 4-byte width, 4-byte height (big-endian)
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: SOI (FFD8), then walk segments until a SOFn marker (FFC0..FFCF, except DHT/JPG/DAC)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) return null;
      let marker = buf[offset + 1];
      // Skip fill bytes
      while (marker === 0xff && offset + 2 < buf.length) {
        offset++;
        marker = buf[offset + 1];
      }
      // Standalone markers without length payload
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      // SOF markers (frame headers) carry width + height. Skip DHT (C4), JPG (C8), DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (offset + 9 >= buf.length) return null;
        const view = new DataView(buf.buffer, buf.byteOffset + offset + 5, 4);
        return { height: view.getUint16(0), width: view.getUint16(2) };
      }
      // Other segments: 2-byte length follows marker
      if (offset + 3 >= buf.length) return null;
      const segmentLength = (buf[offset + 2] << 8) | buf[offset + 3];
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    }
    return null;
  }

  // GIF87a / GIF89a: width and height as little-endian 16-bit at offsets 6, 8
  if (
    buf.length >= 10 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return {
      width: buf[6] | (buf[7] << 8),
      height: buf[8] | (buf[9] << 8),
    };
  }

  // WebP: "RIFF" .... "WEBP" then one of "VP8 ", "VP8L", "VP8X"
  if (
    buf.length >= 30 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    const fourcc = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);

    if (fourcc === "VP8 ") {
      // Lossy: 3-byte frame tag + sync code 9d 01 2a + width(14) + height(14), little-endian
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
      const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
      return { width, height };
    }

    if (fourcc === "VP8L") {
      // Lossless: signature byte 0x2f at offset 20, then 14-bit width-1, 14-bit height-1
      if (buf[20] !== 0x2f) return null;
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = (((b1 & 0x3f) << 8) | b0) + 1;
      const height = (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)) + 1;
      return { width, height };
    }

    if (fourcc === "VP8X") {
      // Extended: 24-bit canvas width-1 at offset 24, height-1 at offset 27 (all little-endian)
      const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width, height };
    }

    return null;
  }

  return null;
}

/**
 * Reads the size an SVG declares, from its `viewBox` or else from its
 * `width` and `height` attributes.
 *
 * @param buf - The leading bytes of the file.
 * @returns `{ width, height }` in user units, or `null` when it is no SVG or
 *   declares no positive size.
 */
export function parseSvgDimensions(buf: Uint8Array): { width: number; height: number } | null {
  const svg = new TextDecoder().decode(buf);
  if (!/<svg\b/i.test(svg)) return null;

  const viewBox = svg.match(/\bviewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i);
  if (viewBox) {
    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    if (width > 0 && height > 0) return { width, height };
  }

  const width = Number(svg.match(/\bwidth=["']([\d.]+)/i)?.[1]);
  const height = Number(svg.match(/\bheight=["']([\d.]+)/i)?.[1]);
  return width > 0 && height > 0 ? { width, height } : null;
}

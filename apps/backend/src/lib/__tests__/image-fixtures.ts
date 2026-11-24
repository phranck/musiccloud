/**
 * @file Image header bytes for the tests of the preview reader and the image
 * dimension parser.
 *
 * Each builder writes only the leading bytes a parser reads, so a test states
 * the size it expects without shipping a real image file.
 */

/**
 * Builds the leading bytes of a PNG with the given size.
 *
 * @param width - The width written into `IHDR`.
 * @param height - The height written into `IHDR`.
 * @returns The signature and the `IHDR` chunk up to the height.
 */
export function buildPng(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

/**
 * Builds the leading bytes of a JPEG with the given size.
 *
 * @param width - The width written into the `SOF0` segment.
 * @param height - The height written into the `SOF0` segment.
 * @returns `SOI` and a `SOF0` segment.
 */
export function buildJpeg(width: number, height: number): Uint8Array {
  // SOI + SOF0 segment (length 17, precision 8, height, width, 3 components, 9 bytes of component data)
  const buf = new Uint8Array(22);
  buf.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  buf[7] = (height >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (width >> 8) & 0xff;
  buf[10] = width & 0xff;
  buf[11] = 3;
  return buf;
}

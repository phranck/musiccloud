/**
 * @file Tests for reading an image's pixel size from its header bytes.
 *
 * Ported from lmaa.space `apps/backend/src/__tests__/og.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { buildJpeg, buildPng } from "./__tests__/image-fixtures.js";
import { parseImageDimensions } from "./image-dimensions.js";

/**
 * Builds the leading bytes of a GIF with the given size.
 *
 * @param width - The logical screen width.
 * @param height - The logical screen height.
 * @returns The `GIF89a` header and logical screen size.
 */
function buildGif(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10);
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  buf[6] = width & 0xff;
  buf[7] = (width >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (height >> 8) & 0xff;
  return buf;
}

/**
 * Builds the leading bytes of an extended WebP with the given canvas size.
 *
 * @param width - The canvas width.
 * @param height - The canvas height.
 * @returns The `RIFF`/`WEBP` header and a `VP8X` chunk.
 */
function buildWebPVP8X(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], 0);
  buf.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const storedWidth = width - 1;
  const storedHeight = height - 1;
  buf[24] = storedWidth & 0xff;
  buf[25] = (storedWidth >> 8) & 0xff;
  buf[26] = (storedWidth >> 16) & 0xff;
  buf[27] = storedHeight & 0xff;
  buf[28] = (storedHeight >> 8) & 0xff;
  buf[29] = (storedHeight >> 16) & 0xff;
  return buf;
}

describe("parseImageDimensions", () => {
  it("reads PNG IHDR dimensions", () => {
    expect(parseImageDimensions(buildPng(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(parseImageDimensions(buildPng(64, 64))).toEqual({ width: 64, height: 64 });
  });

  it("reads JPEG SOF0 dimensions", () => {
    expect(parseImageDimensions(buildJpeg(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it("reads GIF logical screen descriptor", () => {
    expect(parseImageDimensions(buildGif(180, 90))).toEqual({ width: 180, height: 90 });
  });

  it("reads WebP VP8X canvas dimensions", () => {
    expect(parseImageDimensions(buildWebPVP8X(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it("returns null for unknown formats", () => {
    expect(parseImageDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
  });

  it("returns null for truncated PNG signatures", () => {
    expect(parseImageDimensions(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

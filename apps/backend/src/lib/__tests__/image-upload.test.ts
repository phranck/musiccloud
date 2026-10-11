import { IMAGE_UPLOAD_MAX_BYTES } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { ImageUploadRefusal, parseImageDataUrl } from "../image-upload.js";

/**
 * A base64 `data:` URL whose payload decodes to the given number of bytes.
 *
 * @param mimeType - The media type the URL names.
 * @param bytes - How many bytes the payload decodes to.
 * @returns The data URL.
 */
function dataUrl(mimeType: string, bytes = 16): string {
  return `data:${mimeType};base64,${Buffer.alloc(bytes, 1).toString("base64")}`;
}

describe("parseImageDataUrl", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s and returns its type and payload", (mimeType) => {
    const url = dataUrl(mimeType);

    expect(parseImageDataUrl(url)).toEqual({ ok: true, mimeType, base64: url.slice(url.indexOf(",") + 1) });
  });

  it.each([
    ["an SVG, which can carry script", dataUrl("image/svg+xml")],
    ["a GIF", dataUrl("image/gif")],
    ["an image without `;base64`", `data:image/png,${Buffer.alloc(16, 1).toString("base64")}`],
    ["a type in upper case", dataUrl("IMAGE/PNG")],
    ["something that is not an image", dataUrl("text/html")],
    ["a value that is not a data URL", "https://example.com/picture.png"],
  ])("refuses %s as an unsupported type", (_label, url) => {
    expect(parseImageDataUrl(url)).toEqual({ ok: false, reason: ImageUploadRefusal.UnsupportedType });
  });

  it("accepts an image of exactly the cap and refuses one byte more", () => {
    expect(parseImageDataUrl(dataUrl("image/jpeg", IMAGE_UPLOAD_MAX_BYTES))).toMatchObject({ ok: true });
    expect(parseImageDataUrl(dataUrl("image/jpeg", IMAGE_UPLOAD_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: ImageUploadRefusal.TooLarge,
    });
  });
});

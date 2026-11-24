/**
 * @file Tests for copying a sponsor's picture into musiccloud's own store.
 *
 * The download is replaced by hand-built responses, because what is under test
 * is what this module does with the bytes; `fetchWithTimeout`'s destination
 * guard has its own tests. The store is replaced so no database is touched.
 */

import { Jimp } from "jimp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchExternalResource } from "../lib/external-resource.js";
import { log } from "../lib/infra/logger.js";
import { copySponsorAvatar } from "./sponsor-avatar-copy.js";
import { storeSponsorAvatar } from "./sponsor-avatars.js";

vi.mock("../lib/external-resource.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/external-resource.js")>()),
  fetchExternalResource: vi.fn(),
}));

vi.mock("./sponsor-avatars.js", () => ({
  storeSponsorAvatar: vi.fn(),
}));

const fetchResource = vi.mocked(fetchExternalResource);
const store = vi.mocked(storeSponsorAvatar);

/** The address every case asks for. */
const PICTURE_URL = "https://files.example/avatar.png";

/** The id the replaced store answers with. */
const STORED_ID = "c".repeat(64);

/**
 * Encodes a plain image of the given size.
 *
 * @param width - Its width in pixels.
 * @param height - Its height in pixels.
 * @param mime - The format to encode it in.
 * @returns The encoded bytes, in a buffer of their own as a response body takes them.
 */
async function encodedImage(
  width: number,
  height: number,
  mime: "image/png" | "image/jpeg",
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Jimp({ width, height, color: 0x3366ccff }).getBuffer(mime));
}

/**
 * Answers the next download with a response.
 *
 * @param body - The bytes or text sent.
 * @param headers - The response headers.
 * @param status - The status code, 200 unless given.
 */
function answerWith(body: BodyInit, headers: Record<string, string>, status = 200): void {
  fetchResource.mockResolvedValueOnce({ response: new Response(body, { status, headers }), finalUrl: PICTURE_URL });
}

describe("copySponsorAvatar", () => {
  beforeEach(() => {
    fetchResource.mockReset();
    store.mockReset();
    store.mockResolvedValue(STORED_ID);
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
  });

  it.each(["image/png", "image/jpeg"] as const)("stores a %s as a 256 pixel square PNG", async (mime) => {
    answerWith(await encodedImage(300, 200, mime), { "content-type": mime });

    expect(await copySponsorAvatar(PICTURE_URL)).toBe(STORED_ID);

    const stored = store.mock.calls[0]?.[0] as Buffer;
    const decoded = await Jimp.read(stored);
    expect(decoded.mime).toBe("image/png");
    expect([decoded.width, decoded.height]).toEqual([256, 256]);
  });

  it.each([
    ["an SVG", "image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg'/>"],
    ["an HTML page", "text/html; charset=utf-8", "<html></html>"],
  ])("refuses %s without storing anything", async (_case, contentType, body) => {
    answerWith(body, { "content-type": contentType });

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(store).not.toHaveBeenCalled();
    expect(log.deviation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "not_a_raster_image", host: "files.example" }),
      undefined,
    );
  });

  it("refuses a picture whose server answers with an error", async () => {
    answerWith(await encodedImage(10, 10, "image/png"), { "content-type": "image/png" }, 404);

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });

  it("refuses a body that declares more than the budget", async () => {
    answerWith(await encodedImage(10, 10, "image/png"), {
      "content-type": "image/png",
      "content-length": String(9 * 1024 * 1024),
    });

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(log.deviation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "too_large" }), undefined);
  });

  it("refuses a canvas wider than it decodes, before decoding it", async () => {
    answerWith(await encodedImage(4097, 1, "image/png"), { "content-type": "image/png" });

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(log.deviation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "canvas_too_large" }), undefined);
  });

  it("refuses bytes that do not decode as an image", async () => {
    answerWith("definitely not a PNG", { "content-type": "image/png" });

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(store).not.toHaveBeenCalled();
    expect(log.deviation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "undecodable" }), expect.anything());
  });

  it("answers nothing when the download was refused", async () => {
    fetchResource.mockResolvedValueOnce(null);

    expect(await copySponsorAvatar(PICTURE_URL)).toBeNull();
    expect(store).not.toHaveBeenCalled();
  });
});

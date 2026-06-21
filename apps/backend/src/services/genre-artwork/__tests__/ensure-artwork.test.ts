import { beforeEach, describe, expect, it, vi } from "vitest";

// The real generator loads a font from `dist/` (unavailable in unit context),
// so stub the whole rendering + persistence stack and assert only the
// persistence decision in `ensureArtwork`. `vi.hoisted` lets the mock
// factories (which are hoisted above the module) reference these stubs.
const mocks = vi.hoisted(() => ({
  generateArtwork: vi.fn(async () => Buffer.from([0xff, 0xd8])),
  getArtwork: vi.fn(async () => null),
  saveArtwork: vi.fn(async () => {}),
  extractColorsFromBuffer: vi.fn(async () => ({ avgHex: "#123456" })),
  fetchWithTimeout: vi.fn(),
}));

vi.mock("../generator.js", () => ({ generateArtwork: mocks.generateArtwork }));
vi.mock("../repository.js", () => ({
  getArtwork: mocks.getArtwork,
  saveArtwork: mocks.saveArtwork,
  getAccentColors: vi.fn(),
  clearAllArtworks: vi.fn(),
}));
vi.mock("../color-extractor.js", () => ({ extractColorsFromBuffer: mocks.extractColorsFromBuffer }));
vi.mock("../../../lib/infra/fetch.js", () => ({ fetchWithTimeout: mocks.fetchWithTimeout }));
vi.mock("../../../lib/infra/logger.js", () => ({ log: { debug: vi.fn() } }));

import { ensureArtwork } from "../index.js";

describe("ensureArtwork persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateArtwork.mockResolvedValue(Buffer.from([0xff, 0xd8]));
    mocks.getArtwork.mockResolvedValue(null);
  });

  it("persists a tile rendered from a successfully fetched cover", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    mocks.extractColorsFromBuffer.mockResolvedValue({ avgHex: "#123456" });

    await ensureArtwork("jazz", "https://cover/x.png", "Jazz");

    expect(mocks.saveArtwork).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist when a cover URL was present but the fetch failed (transient → retry)", async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new Error("timeout"));

    const { accentColor } = await ensureArtwork("gothic", "https://cover/y.png", "Gothic");

    // Still renders + returns a fallback tile for this request …
    expect(mocks.generateArtwork).toHaveBeenCalledTimes(1);
    expect(accentColor).toBe("#28A8D8");
    // … but must not freeze it in the cache.
    expect(mocks.saveArtwork).not.toHaveBeenCalled();
  });

  it("does NOT persist when the cover responds non-OK", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });

    await ensureArtwork("garage", "https://cover/z.png", "Garage");

    expect(mocks.saveArtwork).not.toHaveBeenCalled();
  });

  it("persists a name-only tile when the genre genuinely has no cover URL", async () => {
    await ensureArtwork("obscure", null, "Obscure");

    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
    expect(mocks.saveArtwork).toHaveBeenCalledTimes(1);
  });
});

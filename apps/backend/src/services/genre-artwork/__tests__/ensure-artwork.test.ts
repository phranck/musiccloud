import { beforeEach, describe, expect, it, vi } from "vitest";

// The real generator loads a font from `dist/` (unavailable in unit context),
// so stub the whole rendering + persistence stack and assert only the
// persistence / throttling behaviour of `ensureArtwork`. `vi.hoisted` lets the
// mock factories (hoisted above the module) reference these stubs.
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

const okResponse = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

describe("ensureArtwork persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateArtwork.mockResolvedValue(Buffer.from([0xff, 0xd8]));
    mocks.getArtwork.mockResolvedValue(null);
    mocks.extractColorsFromBuffer.mockResolvedValue({ avgHex: "#123456" });
  });

  it("persists a tile rendered from a successfully fetched cover", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(okResponse());

    const { isFallback } = await ensureArtwork("jazz", "https://cover/x.png", "Jazz");

    expect(isFallback).toBe(false);
    expect(mocks.saveArtwork).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist when a cover URL was present but the fetch failed (transient → retry)", async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new Error("timeout"));

    const { accentColor, isFallback } = await ensureArtwork("gothic", "https://cover/y.png", "Gothic");

    // Still renders + returns a fallback tile for this request, flagged …
    expect(mocks.generateArtwork).toHaveBeenCalledTimes(1);
    expect(accentColor).toBe("#28A8D8");
    expect(isFallback).toBe(true);
    // … but must not freeze it in the cache.
    expect(mocks.saveArtwork).not.toHaveBeenCalled();
  });

  it("flags a fallback (no persist) when the cover responds non-OK", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });

    const { isFallback } = await ensureArtwork("garage", "https://cover/z.png", "Garage");

    expect(isFallback).toBe(true);
    expect(mocks.saveArtwork).not.toHaveBeenCalled();
  });

  it("persists a non-fallback name-only tile when the genre genuinely has no cover URL", async () => {
    const { isFallback } = await ensureArtwork("obscure", null, "Obscure");

    expect(isFallback).toBe(false);
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
    expect(mocks.saveArtwork).toHaveBeenCalledTimes(1);
  });
});

describe("ensureArtwork cover-fetch throttle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateArtwork.mockResolvedValue(Buffer.from([0xff, 0xd8]));
    mocks.getArtwork.mockResolvedValue(null);
    mocks.extractColorsFromBuffer.mockResolvedValue({ avgHex: "#222222" });
  });

  it("caps concurrent upstream cover fetches (no burst)", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.fetchWithTimeout.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return okResponse();
    });

    // Distinct keys so the per-genre in-flight dedup doesn't merge them.
    await Promise.all(Array.from({ length: 8 }, (_, i) => ensureArtwork(`g${i}`, `https://cover/${i}.png`, `G${i}`)));

    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(8);
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

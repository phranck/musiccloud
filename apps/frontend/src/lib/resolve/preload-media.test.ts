import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadResolvedMedia } from "@/lib/resolve/preload-media";

describe("preloadResolvedMedia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("resolves immediately for an empty target", async () => {
    await expect(preloadResolvedMedia({})).resolves.toBeUndefined();
  });

  it("resolves immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      preloadResolvedMedia(
        { artworkUrl: "https://cdn/x.jpg", previewUrl: "https://cdn/x.mp3" },
        { signal: controller.signal },
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves once the cover has decoded (no audio to wait for)", async () => {
    const decode = vi.fn(() => Promise.resolve());
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = decode as unknown as typeof HTMLImageElement.prototype.decode;
    try {
      await expect(preloadResolvedMedia({ artworkUrl: "https://cdn/cover.jpg" })).resolves.toBeUndefined();
      expect(decode).toHaveBeenCalled();
    } finally {
      HTMLImageElement.prototype.decode = original;
    }
  });

  it("resolves via the timeout when a resource never becomes ready (never hangs)", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    // Audio in jsdom never fires canplaythrough, so this only resolves via the timeout.
    const promise = preloadResolvedMedia({ previewUrl: "https://cdn/never.mp3" }).then(settled);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20000);
    await promise;
    expect(settled).toHaveBeenCalled();
  });
});

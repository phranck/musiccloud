import { describe, expect, it, vi } from "vitest";

vi.mock("../services/plugins/spotify/adapter.js", () => ({ spotifyAdapter: {} }));
vi.mock("../services/plugins/deezer/adapter.js", () => ({ deezerAdapter: {} }));

const { findReplacement } = await import("./replace-apple-artwork.js");

const APPLE_COVER = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/aa/bb/cc/source/640x640bb.jpg";
const SPOTIFY_COVER = "https://i.scdn.co/image/ab67616d0000b273";
const DEEZER_COVER = "https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg";

describe("finding the cover that replaces a stored Apple cover", () => {
  it("takes the first service's cover and asks no further", async () => {
    const deezer = vi.fn(async () => DEEZER_COVER);

    await expect(findReplacement([async () => SPOTIFY_COVER, deezer])).resolves.toEqual({
      kind: "replace",
      url: SPOTIFY_COVER,
    });
    expect(deezer).not.toHaveBeenCalled();
  });

  it("passes over an Apple cover a service returns", async () => {
    await expect(findReplacement([async () => APPLE_COVER, async () => DEEZER_COVER])).resolves.toEqual({
      kind: "replace",
      url: DEEZER_COVER,
    });
  });

  it("asks the next service when one fails", async () => {
    const failing = async (): Promise<string | undefined> => {
      throw new Error("Spotify failed: 429");
    };

    await expect(findReplacement([failing, async () => DEEZER_COVER])).resolves.toEqual({
      kind: "replace",
      url: DEEZER_COVER,
    });
  });

  it("clears the cover when every service answered without one", async () => {
    await expect(findReplacement([async () => undefined, async () => APPLE_COVER])).resolves.toEqual({
      kind: "clear",
    });
    await expect(findReplacement([])).resolves.toEqual({ kind: "clear" });
  });

  it("keeps the row for the next run when a failure stands in for an answer", async () => {
    const failing = async (): Promise<string | undefined> => {
      throw new Error("Spotify failed: 429");
    };

    await expect(findReplacement([failing, async () => undefined])).resolves.toEqual({
      kind: "keep",
      reason: "Spotify failed: 429",
    });
  });
});

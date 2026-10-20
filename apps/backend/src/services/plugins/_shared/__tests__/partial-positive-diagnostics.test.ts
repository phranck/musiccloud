import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/infra/fetch", () => ({ fetchWithTimeout: fetchMock }));
vi.mock("../../../../lib/infra/token-manager", () => ({
  TokenManager: class {
    isConfigured() {
      return true;
    }
    async getAccessToken() {
      return "test-only-token";
    }
    reset() {}
  },
}));

import { log } from "../../../../lib/infra/logger";
import { appleMusicAdapter } from "../../apple-music/adapter";
import spotifyReply from "../../spotify/__tests__/fixtures/get-lucky-candidates.json";
import { spotifyAdapter } from "../../spotify/adapter";

const appleSong = {
  id: "test-only-song",
  type: "songs",
  attributes: { name: "Get Lucky", artistName: "Daft Punk", isrc: "USQX91300108", url: "https://example.invalid/song" },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("APPLE_MUSIC_TOKEN", "test-only-token");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("positive partial-search diagnostics", () => {
  it("keeps Spotify's accepted recording and logs its failed alternative", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockImplementation(async () => Response.json(spotifyReply));
    const deviation = vi.spyOn(log, "deviation");
    expect(
      (await spotifyAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] })).found,
    ).toBe(true);
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ adapterId: "spotify", operation: "track_search_alternatives" }),
      expect.any(Error),
    );
    expect(deviation).toHaveBeenCalledTimes(1);
  });

  it.each(["search", "ISRC"])("keeps an Apple %s positive and logs its failed storefront", async (operation) => {
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockImplementation(async () =>
        Response.json(operation === "ISRC" ? { data: [appleSong] } : { results: { songs: { data: [appleSong] } } }),
      );
    const deviation = vi.spyOn(log, "deviation");
    const result =
      operation === "ISRC"
        ? await appleMusicAdapter.findByIsrc("USQX91300108")
        : await appleMusicAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] });
    expect(result).not.toBeNull();
    if (result && "found" in result) expect(result.found).toBe(true);
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ adapterId: "apple-music", operation: "storefront_catalog_lookup" }),
      expect.any(Error),
    );
    expect(deviation).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("keeps ordinary regional 404 fallback distinct (positive=%s)", async (positive) => {
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockImplementation(async () => Response.json({ results: { songs: { data: positive ? [appleSong] : [] } } }));
    const deviation = vi.spyOn(log, "deviation");
    expect(
      (await appleMusicAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] })).found,
    ).toBe(positive);
    expect(deviation).not.toHaveBeenCalled();
  });
});

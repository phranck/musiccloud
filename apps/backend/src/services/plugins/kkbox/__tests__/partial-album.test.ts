import { afterEach, describe, expect, it, vi } from "vitest";

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
import { kkboxAdapter } from "../adapter";

afterEach(() => vi.restoreAllMocks());

describe("KKBOX: optional album listing failure", () => {
  it.each([503, 200])("keeps the positive album and logs a failed listing (HTTP %s)", async (status) => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          id: "test-only-album",
          name: "Test Album",
          url: "https://example.invalid/album",
          artist: { name: "Test Artist" },
        }),
      )
      .mockResolvedValueOnce(Response.json({}, { status }));
    const deviation = vi.spyOn(log, "deviation");
    const album = await kkboxAdapter.getAlbum("test-only-album");
    expect(album.title).toBe("Test Album");
    expect(album.tracks).toBeUndefined();
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "album_tracklist_enrichment", outcome: "tracklist_omitted" }),
      expect.any(Error),
    );
  });
});

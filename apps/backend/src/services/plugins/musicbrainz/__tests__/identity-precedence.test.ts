import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../rate-limit.js", () => ({ acquireMusicBrainzSlot: async () => {} }));

import { musicbrainzAdapter } from "../adapter";

afterEach(() => vi.restoreAllMocks());

/** Synthetic provider-score control. It does not claim a live MusicBrainz recording. */
describe("MusicBrainz: recording identity precedence", () => {
  it("does not let a perfect provider score revive an incompatible artist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        recordings: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "Get Lucky",
            score: 100,
            "artist-credit": [
              { name: "Daft Punk Experience", artist: { id: "test-only-artist", name: "Daft Punk Experience" } },
            ],
          },
        ],
      }),
    );
    const result = await musicbrainzAdapter.searchTrackWithCandidates({
      title: "Get Lucky",
      artist: "Daft Punk",
      artists: ["Daft Punk"],
    });
    expect(result.bestMatch.found).toBe(false);
    expect(result.candidates[0].confidence).toBe(0);
  });
});

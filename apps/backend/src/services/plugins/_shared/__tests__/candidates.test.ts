import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../../../lib/infra/logger.js";
import type { NormalizedAlbum, NormalizedTrack } from "../../../types.js";
import { bestSettledAlbum, bestSettledTrack, throwIfSearchIncomplete } from "../candidates.js";

const absent: PromiseSettledResult<string | null> = { status: "fulfilled", value: null };
const candidate: PromiseSettledResult<string | null> = { status: "fulfilled", value: "candidate" };

/** Constructs a rejected mocked candidate without any provider or repository operation. */
function failed(reason: string): PromiseSettledResult<string | null> {
  return { status: "rejected", reason: new Error(reason) };
}

describe("throwIfSearchIncomplete", () => {
  it("throws the first failure when every candidate request failed", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), failed("second")], false, "melon")).toThrow("first");
  });
  it("does not turn another candidate's explicit absence into complete negative evidence", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), absent], false, "melon")).toThrow("first");
  });
  it("does not treat a readable but incompatible candidate as a successful recording match", () => {
    expect(() => throwIfSearchIncomplete([candidate, failed("second")], false, "melon")).toThrow("second");
  });
  it("retains an accepted positive despite another candidate failure", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), candidate], true, "melon")).not.toThrow();
  });
  it("permits a fully completed clean miss", () => {
    expect(() => throwIfSearchIncomplete([absent, candidate], false, "melon")).not.toThrow();
  });
  it("permits an empty candidate list returned by the search endpoint", () => {
    expect(() => throwIfSearchIncomplete([], false, "melon")).not.toThrow();
  });
});

/** A track page that matches the searched track exactly. */
const matchingTrack: NormalizedTrack = {
  sourceService: "melon",
  sourceId: "track-1",
  title: "Song",
  artists: ["Artist"],
  webUrl: "https://example.test/track-1",
};

/** An album page that matches the searched album exactly. */
const matchingAlbum: NormalizedAlbum = {
  sourceService: "melon",
  sourceId: "album-1",
  title: "Album",
  artists: ["Artist"],
  webUrl: "https://example.test/album-1",
};

describe("bestSettledTrack", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scores and logs a track with the position of its page after a skipped page", () => {
    const debug = vi.spyOn(log, "debug").mockImplementation(() => {});
    const match = bestSettledTrack(
      { title: "Song", artist: "Artist" },
      [
        { status: "fulfilled", value: null },
        { status: "fulfilled", value: matchingTrack },
      ],
      "melon",
      "Melon",
    );
    expect(match).toMatchObject({ found: true, track: matchingTrack, matchMethod: "search" });
    expect(debug.mock.calls[0]?.[1]).toMatch(/^ {2}\[1\] "Song" by Artist -> confidence=/);
  });

  it("throws a page failure when no track qualified", () => {
    vi.spyOn(log, "debug").mockImplementation(() => {});
    const results: PromiseSettledResult<NormalizedTrack | null>[] = [{ status: "rejected", reason: new Error("page") }];
    expect(() => bestSettledTrack({ title: "Song", artist: "Artist" }, results, "melon", "Melon")).toThrow("page");
  });
});

describe("bestSettledAlbum", () => {
  afterEach(() => vi.restoreAllMocks());

  it("finds the matching album and writes its score line only when a component is named", () => {
    const debug = vi.spyOn(log, "debug").mockImplementation(() => {});
    const results: PromiseSettledResult<NormalizedAlbum | null>[] = [{ status: "fulfilled", value: matchingAlbum }];
    const query = { title: "Album", artist: "Artist" };
    expect(bestSettledAlbum(query, results, "bandcamp")).toMatchObject({ found: true, album: matchingAlbum });
    expect(debug).not.toHaveBeenCalled();
    bestSettledAlbum(query, results, "melon", "Melon");
    expect(debug.mock.calls[0]?.[1]).toMatch(/^ {2}"Album" -> confidence=/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedTrackResult, TrackRepository } from "../../../db/repository.js";

vi.mock("../../../db/index.js", () => ({
  getRepository: vi.fn(),
}));

import { getRepository } from "../../../db/index.js";
import { isAlreadyIngested } from "../dedupe.js";

let mockRepo: {
  findTrackByUrl: ReturnType<typeof vi.fn>;
  findTrackByIsrc: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockRepo = {
    findTrackByUrl: vi.fn().mockResolvedValue(null),
    findTrackByIsrc: vi.fn().mockResolvedValue(null),
  };
  vi.mocked(getRepository).mockResolvedValue(mockRepo as unknown as TrackRepository);
});

describe("isAlreadyIngested: URL candidates", () => {
  it("returns true when the URL is already in tracks.source_url", async () => {
    mockRepo.findTrackByUrl.mockResolvedValueOnce({ trackId: "tid" } as unknown as CachedTrackResult);

    const result = await isAlreadyIngested({ kind: "url", url: "https://www.deezer.com/track/1" });

    expect(result).toBe(true);
    expect(mockRepo.findTrackByUrl).toHaveBeenCalledWith("https://www.deezer.com/track/1");
    expect(mockRepo.findTrackByIsrc).not.toHaveBeenCalled();
  });

  it("returns true when the ISRC matches via findTrackByIsrc (covers canonical + aggregation fallback)", async () => {
    mockRepo.findTrackByIsrc.mockResolvedValueOnce({ trackId: "tid" } as unknown as CachedTrackResult);

    const result = await isAlreadyIngested({
      kind: "url",
      url: "https://www.deezer.com/track/1",
      isrc: "USRC11111111",
    });

    expect(result).toBe(true);
    expect(mockRepo.findTrackByIsrc).toHaveBeenCalledWith("USRC11111111");
  });

  it("returns false when neither URL nor ISRC matches", async () => {
    const result = await isAlreadyIngested({
      kind: "url",
      url: "https://www.deezer.com/track/2",
      isrc: "USRC99999999",
    });

    expect(result).toBe(false);
    expect(mockRepo.findTrackByUrl).toHaveBeenCalled();
    expect(mockRepo.findTrackByIsrc).toHaveBeenCalled();
  });

  it("skips ISRC lookup when no ISRC is supplied on the candidate", async () => {
    const result = await isAlreadyIngested({ kind: "url", url: "https://www.deezer.com/track/3" });

    expect(result).toBe(false);
    expect(mockRepo.findTrackByUrl).toHaveBeenCalled();
    expect(mockRepo.findTrackByIsrc).not.toHaveBeenCalled();
  });
});

describe("isAlreadyIngested: search candidates", () => {
  it("always returns false (resolver-cache absorbs duplicates one layer down)", async () => {
    const result = await isAlreadyIngested({ kind: "search", title: "Bohemian Rhapsody", artist: "Queen" });

    expect(result).toBe(false);
    expect(mockRepo.findTrackByUrl).not.toHaveBeenCalled();
    expect(mockRepo.findTrackByIsrc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedTrackResult, PreviewObservation, PreviewRow } from "../../db/repository.js";
import type { NormalizedTrack, ServiceAdapter } from "../types.js";

const state = vi.hoisted(() => ({
  previews: [] as PreviewRow[],
  repository: {
    findTrackByUrl: vi.fn(),
    findTrackByServiceLink: vi.fn(),
    findTrackByIsrc: vi.fn(),
    readServiceLinkMisses: vi.fn(),
    addLinksToTrack: vi.fn(),
    clearServiceLinkMisses: vi.fn(),
    addTrackExternalIds: vi.fn(),
    findTrackPreviews: vi.fn(),
    upsertTrackPreview: vi.fn(),
    updateTrackTimestamp: vi.fn(async () => undefined),
  },
  activeAdapters: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({ getRepository: async () => state.repository }));
vi.mock("../index.js", () => ({
  getActiveAdapters: state.activeAdapters,
  filterDisabledLinks: async <Link>(links: Link[]) => links,
}));

import { persistTrackAndRespond } from "../resolve-response.js";
import { resolveSelectedCandidate } from "../resolver.js";

const EXPIRED_PREVIEW = "https://cdnt-preview.dzcdn.net/clip.mp3?hdnea=exp=946684800~hmac=old";
const FRESH_PREVIEW = "https://cdnt-preview.dzcdn.net/clip.mp3?hdnea=exp=4102444800~hmac=fresh";
const video: NormalizedTrack = {
  sourceService: "youtube",
  sourceId: "ImX2w6Ufj4w",
  title: "Hurt People feat. @marinalatorracaofficial of @BattleBeast",
  artists: ["DARKK"],
  durationMs: 200000,
  artworkUrl: "https://example.test/recording-cover.jpg",
  previewUrl: EXPIRED_PREVIEW,
  webUrl: "https://www.youtube.com/watch?v=ImX2w6Ufj4w",
};
const recording: NormalizedTrack = {
  ...video,
  sourceService: "deezer",
  sourceId: "4275996402",
  title: "Hurt People",
  isrc: "DEZC62699545",
  previewUrl: FRESH_PREVIEW,
  webUrl: "https://www.deezer.com/track/4275996402",
};
const deezer: ServiceAdapter = {
  id: "deezer",
  displayName: "Deezer",
  capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
  detectUrl: () => recording.sourceId,
  getTrack: vi.fn(async () => recording),
  findByIsrc: vi.fn(async () => recording),
  searchTrack: vi.fn(async () => ({ found: false, confidence: 0, matchMethod: "search" })),
};

beforeEach(() => {
  vi.clearAllMocks();
  state.previews = [
    { service: "deezer", url: EXPIRED_PREVIEW, expiresAt: new Date(946684800000), observedAt: new Date() },
  ];
  state.activeAdapters.mockResolvedValue([deezer]);
  state.repository.findTrackByUrl.mockResolvedValue(null);
  state.repository.findTrackByServiceLink.mockResolvedValue(null);
  state.repository.readServiceLinkMisses.mockResolvedValue([]);
  state.repository.findTrackPreviews.mockImplementation(async () => state.previews);
  state.repository.upsertTrackPreview.mockImplementation(async (_trackId: string, observation: PreviewObservation) => {
    state.previews = [{ ...observation, observedAt: new Date() }];
  });
  const cached: CachedTrackResult = {
    trackId: "existing-track",
    shortId: "A14b_Eho",
    updatedAt: Date.now(),
    track: { ...video },
    links: [
      { service: "youtube", url: video.webUrl, confidence: 1, matchMethod: "source" },
      { service: "deezer", url: recording.webUrl, confidence: 0.99, matchMethod: "search" },
    ],
  };
  state.repository.findTrackByIsrc.mockResolvedValue(cached);
});

describe("selected recording preview ownership", () => {
  it("exposes the existing refresh contract when a cached video has no usable preview", async () => {
    const response = await persistTrackAndRespond(
      {
        sourceTrack: { ...video, previewUrl: undefined },
        links: [
          { service: "deezer", displayName: "Deezer", url: recording.webUrl, confidence: 1, matchMethod: "search" },
        ],
        trackId: "existing-track",
        shortId: "A14b_Eho",
        externalIds: [],
      },
      "https://musiccloud.io",
    );

    expect(response.type).toBe("track");
    if (response.type !== "track") throw new Error("Expected a track response");
    expect(response.track.previewUrl).toBeUndefined();
    expect(response.track.previewRefreshable).toBe(true);
    expect(response.shortUrl).toBe("https://musiccloud.io/A14b_Eho");
  });

  it("returns the newly observed preview on the first cached selection", async () => {
    const result = await resolveSelectedCandidate("deezer:4275996402");

    expect(result.sourceTrack.previewUrl).toBe(FRESH_PREVIEW);
    expect(result.trackId).toBe("existing-track");
    expect(result.shortId).toBe("A14b_Eho");
    expect(result.sourceTrack.title).toBe(video.title);
    expect(result.sourceTrack.isrc).toBeUndefined();
  });
});

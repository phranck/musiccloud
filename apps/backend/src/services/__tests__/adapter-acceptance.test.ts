import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedTrackResult } from "../../db/repository.js";
import type { MatchResult, NormalizedTrack, SearchQuery, ServiceAdapter, ServiceId } from "../types.js";

const state = vi.hoisted(() => ({
  active: vi.fn(),
  identify: vi.fn(),
  repository: {
    findTrackByUrl: vi.fn(),
    findTrackByServiceLink: vi.fn(),
    findTrackByIsrc: vi.fn(),
    readServiceLinkMisses: vi.fn(),
    recordServiceLinkMisses: vi.fn(),
    clearServiceLinkMisses: vi.fn(),
    findTrackPreviews: vi.fn(),
    addLinksToTrack: vi.fn(),
    addTrackExternalIds: vi.fn(),
    upsertTrackPreview: vi.fn(),
  },
}));
vi.mock("../../db/index.js", () => ({ getRepository: async () => state.repository }));
vi.mock("../index.js", () => ({
  getActiveAdapters: state.active,
  identifyService: state.identify,
  findInactiveServiceFor: async () => null,
  isPluginAvailable: () => true,
  filterDisabledLinks: async <Link>(links: Link[]) => links,
}));

import { resolveUrl } from "../resolver.js";

/** Observed studio identity; the existing test-only cover prevents unrelated artwork requests. */
const studio: NormalizedTrack = {
  sourceService: "spotify",
  sourceId: "69kOkLUCkxIZYexIgSG8rq",
  title: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
  artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
  durationMs: 369626,
  isrc: "USQX91300108",
  albumName: "Random Access Memories",
  artworkUrl: "https://example.test/existing-recording-cover.jpg",
  webUrl: "https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq",
};
/** Different performer and recording returned by the observed Pandora search. */
const cover: NormalizedTrack = {
  sourceService: "pandora",
  sourceId: "daft-punk-experience-and-zico-oliveira/get-lucky/get-lucky/TRflPd6xqJ3rnjm",
  title: "Get Lucky",
  artists: ["Daft Punk Experience", "Zico Oliveira"],
  isrc: "BXCPT2000157",
  durationMs: 204920,
  webUrl: "https://www.pandora.com/artist/daft-punk-experience-and-zico-oliveira/get-lucky/get-lucky/TRflPd6xqJ3rnjm",
};

/**
 * Creates a complete adapter boundary without a provider or database connection.
 * @param id - Provider represented by this test double.
 * @param track - Public metadata used only when its source getter is invoked.
 * @returns An adapter with a mutable mocked search and explicit unsupported identifier lookup.
 */
function adapterFor(id: ServiceId, track: NormalizedTrack): ServiceAdapter {
  return {
    id,
    displayName: id,
    capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: false },
    detectUrl: (url) => (url === track.webUrl ? track.sourceId : null),
    getTrack: vi.fn(async () => track),
    findByIsrc: vi.fn(async () => null),
    searchTrack: vi.fn(
      async (_query: SearchQuery): Promise<MatchResult> => ({ found: false, confidence: 0, matchMethod: "search" }),
    ),
  };
}

/**
 * Installs an existing recording with one confirmed source destination in the mocked repository.
 * @param track - Canonical identity that gap filling must not rewrite.
 */
function cacheRecording(track: NormalizedTrack): void {
  const cached: CachedTrackResult = {
    trackId: "audit-existing-track",
    shortId: "audit-share",
    updatedAt: Date.now(),
    track,
    links: [{ service: track.sourceService, url: track.webUrl, confidence: 1, matchMethod: "source" }],
  };
  state.repository.findTrackByUrl.mockResolvedValue(cached);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.repository.findTrackByUrl.mockResolvedValue(null);
  state.repository.findTrackByServiceLink.mockResolvedValue(null);
  state.repository.findTrackByIsrc.mockResolvedValue(null);
  state.repository.readServiceLinkMisses.mockResolvedValue([]);
  state.repository.findTrackPreviews.mockResolvedValue([]);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Acceptance tests forbid provider HTTP"));
});
afterEach(() => vi.restoreAllMocks());

describe("resolver recording acceptance", () => {
  it("rejects an adapter's wrong positive without persisting a link or negative cache entry", async () => {
    const source = adapterFor("spotify", studio);
    const target = adapterFor("pandora", cover);
    vi.mocked(target.searchTrack).mockResolvedValue({
      found: true,
      track: cover,
      confidence: 0.95,
      matchMethod: "search",
    });
    state.active.mockResolvedValue([source, target]);
    state.identify.mockResolvedValue(source);
    cacheRecording(studio);
    const result = await resolveUrl(studio.webUrl);
    expect(result.links.some((link) => link.service === "pandora")).toBe(false);
    expect(state.repository.addLinksToTrack).not.toHaveBeenCalled();
    expect(state.repository.recordServiceLinkMisses).not.toHaveBeenCalled();
    expect(result.sourceTrack.title).toBe(studio.title);
    expect(result.trackId).toBe("audit-existing-track");
    expect(result.shortId).toBe("audit-share");
  });

  it("still records a completed clean miss", async () => {
    const source = adapterFor("spotify", studio);
    const target = adapterFor("pandora", cover);
    state.active.mockResolvedValue([source, target]);
    state.identify.mockResolvedValue(source);
    cacheRecording(studio);
    await resolveUrl(studio.webUrl);
    expect(state.repository.recordServiceLinkMisses).toHaveBeenCalledWith("audit-existing-track", ["pandora"]);
  });

  it("uses Bugs' published Latin name for lookup without rewriting its canonical display credit", async () => {
    const bugs: NormalizedTrack = {
      sourceService: "bugs",
      sourceId: "3109585",
      title: "Get Lucky (Daft Punk Remix)",
      artists: ["Daft Punk(다프트 펑크)", "Pharrell(퍼렐)", "Nile Rodgers(나일 로저스)"],
      durationMs: 632000,
      artworkUrl: studio.artworkUrl,
      webUrl: "https://music.bugs.co.kr/track/3109585",
    };
    const remix: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "78NwNb2BPO7OKDYYRWB1WT",
      title: "Get Lucky - Daft Punk Remix",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers", "Florian Lagatta"],
      isrc: "USQX91301322",
      durationMs: 632693,
      webUrl: "https://open.spotify.com/track/78NwNb2BPO7OKDYYRWB1WT",
    };
    const source = adapterFor("bugs", bugs);
    const target = adapterFor("spotify", remix);
    vi.mocked(target.searchTrack).mockResolvedValue({
      found: true,
      track: remix,
      confidence: 0.8,
      matchMethod: "search",
    });
    state.active.mockResolvedValue([source, target]);
    state.identify.mockResolvedValue(source);
    cacheRecording(bugs);
    const result = await resolveUrl(bugs.webUrl);
    expect(target.searchTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: "Daft Punk",
        artists: ["Daft Punk", "Pharrell", "Nile Rodgers"],
      }),
    );
    expect(result.links.some((link) => link.service === "spotify")).toBe(true);
    expect(result.sourceTrack.artists).toEqual(bugs.artists);
  });
});

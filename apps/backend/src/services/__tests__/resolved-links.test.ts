import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../lib/infra/logger.js";
import {
  collectSettledLinks,
  findAdapterForUrl,
  fromCachedLinks,
  isStoredPreviewFresh,
  sourceLink,
  toStoredLinks,
  uniqueAdaptersByService,
} from "../resolved-links.js";
import type { ServiceAdapter } from "../types.js";

/** A Spotify URL carrying a tracking parameter that `stripTrackingParams` removes. */
const TRACKED_URL = "https://open.spotify.com/track/abc?si=tracking-token";
/** {@link TRACKED_URL} after its tracking parameter is removed. */
const CLEAN_URL = "https://open.spotify.com/track/abc";

describe("toStoredLinks", () => {
  const resolved = {
    service: "spotify",
    displayName: "Spotify",
    url: TRACKED_URL,
    confidence: 0.9,
    matchMethod: "isrc",
    externalId: "abc",
    previewUrl: "https://p.scdn.co/preview.mp3",
  };

  it("copies only the stored fields and keeps the URL unchanged by default", () => {
    expect(toStoredLinks([resolved])).toEqual([
      { service: "spotify", url: TRACKED_URL, confidence: 0.9, matchMethod: "isrc", externalId: "abc" },
    ]);
  });

  it("strips tracking parameters when asked to", () => {
    expect(toStoredLinks([resolved], { stripTracking: true })).toEqual([
      { service: "spotify", url: CLEAN_URL, confidence: 0.9, matchMethod: "isrc", externalId: "abc" },
    ]);
  });
});

describe("fromCachedLinks", () => {
  it("labels known services and drops rows naming an unknown one", () => {
    expect(
      fromCachedLinks([
        { service: "deezer", url: "https://www.deezer.com/track/1", confidence: 1, matchMethod: "source" },
        { service: "retired-service", url: "https://example.test/1", confidence: 1, matchMethod: "search" },
      ]),
    ).toEqual([
      {
        service: "deezer",
        displayName: "Deezer",
        url: "https://www.deezer.com/track/1",
        confidence: 1,
        matchMethod: "source",
      },
    ]);
  });
});

describe("isStoredPreviewFresh", () => {
  /** The fixed current time the freshness checks compare against. */
  const NOW = 1_000_000;

  it("is fresh when a row has no expiry or expires later", () => {
    expect(isStoredPreviewFresh([{ service: "deezer", expiresAt: null }], NOW)).toBe(true);
    expect(
      isStoredPreviewFresh(
        [
          { service: "deezer", expiresAt: new Date(NOW - 1) },
          { service: "spotify", expiresAt: new Date(NOW + 1) },
        ],
        NOW,
      ),
    ).toBe(true);
  });

  it("is stale when every row has expired or there is none", () => {
    expect(isStoredPreviewFresh([{ service: "deezer", expiresAt: new Date(NOW) }], NOW)).toBe(false);
    expect(isStoredPreviewFresh([], NOW)).toBe(false);
  });

  /**
   * A removed service's preview URL points at a host nobody serves any more,
   * and an unsigned one never expires. Counting it would skip the Deezer
   * refresh for that recording forever.
   */
  it("ignores a row of a service this build no longer knows", () => {
    expect(isStoredPreviewFresh([{ service: "napster", expiresAt: null }], NOW)).toBe(false);
  });
});

describe("sourceLink", () => {
  const adapter = { id: "deezer", displayName: "Deezer" } as const;
  const entity = { webUrl: "https://www.deezer.com/track/1", sourceId: "1" };

  it("builds the source link without a preview field by default", () => {
    const link = sourceLink(adapter, entity, { confidence: 1, matchMethod: "source" });
    expect(link).toStrictEqual({
      service: "deezer",
      displayName: "Deezer",
      url: "https://www.deezer.com/track/1",
      confidence: 1,
      matchMethod: "source",
      externalId: "1",
    });
  });

  it("carries a preview the caller passes", () => {
    const link = sourceLink(adapter, entity, {
      confidence: 0.8,
      matchMethod: "search",
      previewUrl: "https://cdn.test/preview.mp3",
    });
    expect(link.previewUrl).toBe("https://cdn.test/preview.mp3");
    expect(link.confidence).toBe(0.8);
    expect(link.matchMethod).toBe("search");
  });
});

describe("collectSettledLinks", () => {
  afterEach(() => vi.restoreAllMocks());

  const adapters = [{ id: "spotify" }, { id: "deezer" }, { id: "tidal" }, { id: "qobuz" }] as const;
  const matched = { confidence: 0.9 };
  const results: Array<PromiseSettledResult<{ confidence: number } | null> | undefined> = [
    { status: "fulfilled", value: matched },
    { status: "fulfilled", value: null },
    { status: "rejected", reason: new Error("upstream down") },
    undefined,
  ];

  it("keeps only fulfilled matches and leaves rejections unlogged by default", () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => undefined);
    expect(collectSettledLinks(adapters, results, { component: "Resolver" })).toEqual([matched]);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs a rejected lookup when asked to", () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => undefined);
    collectSettledLinks(adapters, results, { component: "AlbumResolver", logRejected: true });
    expect(error).toHaveBeenCalledWith("AlbumResolver", "[tidal] resolve failed: upstream down");
  });
});

describe("uniqueAdaptersByService", () => {
  it("keeps one adapter per service in first-seen order", () => {
    const first = { id: "deezer", tag: "first" };
    const spotify = { id: "spotify", tag: "only" };
    const repeated = { id: "deezer", tag: "repeated" };
    expect(uniqueAdaptersByService([first, spotify, repeated])).toEqual([repeated, spotify]);
  });
});

describe("findAdapterForUrl", () => {
  /** The URL every detector in these cases is asked about. */
  const DETECTED_URL = "https://example.test/album/1";

  it("skips adapters without the detector or without a match", () => {
    const noDetector = { id: "spotify" } as ServiceAdapter;
    const noMatch = { id: "deezer", detectAlbumUrl: () => null } as unknown as ServiceAdapter;
    const match = { id: "tidal", detectAlbumUrl: () => "1" } as unknown as ServiceAdapter;
    expect(findAdapterForUrl([noDetector, noMatch, match], DETECTED_URL, "detectAlbumUrl")).toBe(match);
    expect(findAdapterForUrl([noDetector, noMatch, match], DETECTED_URL, "detectArtistUrl")).toBeUndefined();
  });
});

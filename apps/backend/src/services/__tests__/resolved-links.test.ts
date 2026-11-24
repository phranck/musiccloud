import { describe, expect, it } from "vitest";
import { fromCachedLinks, isStoredPreviewFresh, toStoredLinks } from "../resolved-links.js";

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
    expect(isStoredPreviewFresh([{ expiresAt: null }], NOW)).toBe(true);
    expect(isStoredPreviewFresh([{ expiresAt: new Date(NOW - 1) }, { expiresAt: new Date(NOW + 1) }], NOW)).toBe(true);
  });

  it("is stale when every row has expired or there is none", () => {
    expect(isStoredPreviewFresh([{ expiresAt: new Date(NOW) }], NOW)).toBe(false);
    expect(isStoredPreviewFresh([], NOW)).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedArtist, ServiceAdapter, ServiceId } from "../services/types.js";

const mockRepo = {
  findArtistByUrl: vi.fn().mockResolvedValue(null),
  findArtistByName: vi.fn().mockResolvedValue(null),
  addLinksToArtist: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(mockRepo),
}));

vi.mock("../services/index.js", () => ({
  getActiveAdapters: vi.fn().mockResolvedValue([]),
  findInactiveServiceFor: vi.fn().mockResolvedValue(null),
  filterDisabledLinks: vi.fn(async <T>(links: T[]) => links),
}));

const { resolveArtistUrl } = await import("../services/artist-resolver.js");
const { getActiveAdapters } = await import("../services/index.js");

const APPLE_PICTURE = "https://is1-ssl.mzstatic.com/image/thumb/AMCArtistImages/v4/aa/bb/cc/640x640bb.jpg";
const SPOTIFY_PICTURE = "https://i.scdn.co/image/ab6761610000e5eb";
const DEEZER_PICTURE = "https://e-cdns-images.dzcdn.net/images/artist/abc/1000x1000-000000-80-0-0.jpg";
const APPLE_ARTIST_URL = "https://music.apple.com/us/artist/radiohead/657515";

function radiohead(service: ServiceId, imageUrl: string | undefined): NormalizedArtist {
  return {
    sourceService: service,
    sourceId: `${service}-657515`,
    name: "Radiohead",
    imageUrl,
    webUrl: `https://${service}.example/artist/657515`,
  };
}

/**
 * An adapter whose artist search finds Radiohead with the given picture, or
 * finds nobody when `imageUrl` is `null`.
 */
function artistAdapter(id: ServiceId, imageUrl: string | undefined | null): ServiceAdapter {
  return {
    id,
    displayName: id,
    capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: true },
    artistCapabilities: { supportsArtistSearch: true },
    detectUrl: vi.fn(() => null),
    detectArtistUrl: vi.fn(() => null),
    getTrack: vi.fn(),
    findByIsrc: vi.fn().mockResolvedValue(null),
    searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
    searchArtist: vi
      .fn()
      .mockResolvedValue(
        imageUrl === null
          ? { found: false, confidence: 0, matchMethod: "search" }
          : { found: true, artist: radiohead(id, imageUrl), confidence: 1, matchMethod: "search" },
      ),
  };
}

function appleSource(): ServiceAdapter {
  return {
    ...artistAdapter("apple-music", null),
    detectArtistUrl: vi.fn((url: string) => (url.includes("music.apple.com") ? "us:657515" : null)),
    getArtist: vi.fn().mockResolvedValue(radiohead("apple-music", APPLE_PICTURE)),
  };
}

describe("ArtistResolver: Apple pictures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findArtistByUrl.mockResolvedValue(null);
    mockRepo.findArtistByName.mockResolvedValue(null);
  });

  it("replaces an Apple artist's picture with Spotify's, ahead of Deezer's", async () => {
    vi.mocked(getActiveAdapters).mockResolvedValue([
      appleSource(),
      artistAdapter("deezer", DEEZER_PICTURE),
      artistAdapter("spotify", SPOTIFY_PICTURE),
    ]);

    const result = await resolveArtistUrl(APPLE_ARTIST_URL);

    expect(result.sourceArtist.imageUrl).toBe(SPOTIFY_PICTURE);
  });

  it("keeps no picture for an Apple artist when no other service has one", async () => {
    vi.mocked(getActiveAdapters).mockResolvedValue([appleSource(), artistAdapter("deezer", undefined)]);

    const result = await resolveArtistUrl(APPLE_ARTIST_URL);

    expect(result.links.some((link) => link.service === "deezer")).toBe(true);
    expect(result.sourceArtist.imageUrl).toBeUndefined();
  });
});

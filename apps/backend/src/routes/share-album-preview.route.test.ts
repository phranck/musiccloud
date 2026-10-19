/**
 * @file Guards how an album share gets a playable preview.
 *
 * Deezer signs its preview URLs for minutes, so the URL stored with an album
 * has usually expired by the time somebody opens its share page. The share
 * response drops such a URL and marks the preview refreshable, and the preview
 * endpoint then fetches a fresh one from Deezer, the same path a track share
 * takes.
 */
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const loadCcByShortId = vi.fn();

const repository = {
  loadByShortId: vi.fn(),
  loadAlbumByShortId: vi.fn(),
  loadArtistByShortId: vi.fn(),
  upsertAlbumPreview: vi.fn(),
  upsertTrackPreview: vi.fn(),
};

const deezer = {
  getAlbum: vi.fn(),
  getTrack: vi.fn(),
  findByIsrc: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(repository),
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/server/cc-share-page.js", () => ({ loadCcByShortId }));

// The real adapter keeps its URL parsing; only the calls that leave the
// process are replaced.
vi.mock("../services/plugins/deezer/adapter.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/plugins/deezer/adapter.js")>();
  return { ...original, deezerAdapter: { ...original.deezerAdapter, ...deezer } };
});

const { default: shareRoutes } = await import("./share.js");
const { default: sharePreviewRoutes } = await import("./share-preview.js");

const SHORT_ID = "album-preview-probe";
const DEEZER_ALBUM_ID = "302127";
/** Unix seconds of 2000-01-01, long past. */
const EXPIRED_TOKEN_SECONDS = 946684800;
/** Unix seconds of 2100-01-01, far ahead. */
const VALID_TOKEN_SECONDS = 4102444800;
const EXPIRED_URL = `https://cdnt-preview.dzcdn.net/api/1/1/stored.mp3?hdnea=exp=${EXPIRED_TOKEN_SECONDS}~hmac=old`;
const VALID_URL = `https://cdnt-preview.dzcdn.net/api/1/1/stored.mp3?hdnea=exp=${VALID_TOKEN_SECONDS}~hmac=valid`;
const FRESH_URL = `https://cdnt-preview.dzcdn.net/api/1/1/fresh.mp3?hdnea=exp=${VALID_TOKEN_SECONDS}~hmac=fresh`;
const DEEZER_LINK = { service: "deezer", url: `https://www.deezer.com/album/${DEEZER_ALBUM_ID}` };

/**
 * Models the video-origin track whose known provider link can refresh its preview.
 * @param previewUrl - The stored clip, which may already have expired.
 * @param links - This fixture's provider identity observations.
 * @returns An isolated repository projection without a canonical ISRC.
 */
function trackShareResult(
  previewUrl: string | null,
  links = [{ service: "deezer", url: "https://www.deezer.com/track/4275996402" }],
) {
  return {
    trackId: "track-1",
    shortId: SHORT_ID,
    artists: ["DARKK"],
    artistCredits: [],
    artistDisplay: "DARKK",
    links,
    track: {
      title: "Hurt People",
      albumName: null,
      artworkUrl: null,
      durationMs: 200000,
      isrc: null,
      releaseDate: null,
      isExplicit: false,
      previewUrl,
    },
  };
}

function albumShareResult(previewUrl: string | null, links: Array<{ service: string; url: string }> = [DEEZER_LINK]) {
  return {
    albumId: "album-1",
    album: {
      title: "Hunting High and Low",
      artworkUrl: "https://example.com/art.jpg",
      releaseDate: "1985-06-01",
      totalTracks: 10,
      label: null,
      upc: null,
      previewUrl,
      vinylLayout: null,
    },
    artists: ["a-ha"],
    artistCredits: [],
    artistDisplay: "a-ha",
    shortId: SHORT_ID,
    links,
  };
}

function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" }, message: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) {
    app.addSchema(schema);
  }
  app.register(shareRoutes);
  app.register(sharePreviewRoutes);
  return app;
}

async function get(url: string) {
  return buildApp().inject({ method: "GET", url });
}

beforeEach(() => {
  vi.stubEnv("PUBLIC_URL", "https://musiccloud.io");
  repository.loadByShortId.mockResolvedValue(null);
  repository.loadArtistByShortId.mockResolvedValue(null);
  loadCcByShortId.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("track preview refresh without a canonical ISRC", () => {
  it.each([
    { artists: ["Unrelated Artist"] },
    { title: "Different Recording" },
    { title: "Hurt People (Remix)" },
    { durationMs: 500000 },
  ])("does not borrow a mismatched recording preview: %j", async (patch) => {
    repository.loadByShortId.mockImplementation(async () => trackShareResult(EXPIRED_URL));
    deezer.getTrack.mockResolvedValue({
      sourceService: "deezer",
      sourceId: "4275996402",
      title: "Hurt People",
      artists: ["DARKK"],
      durationMs: 201000,
      webUrl: "https://www.deezer.com/track/4275996402",
      previewUrl: FRESH_URL,
      ...patch,
    });
    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);
    expect(response.json()).toEqual({ previewUrl: null });
    expect(repository.upsertTrackPreview).not.toHaveBeenCalled();
  });

  it.each([
    "https://notdeezer.com/track/4275996402",
    "https://www.deezer.com/search/Hurt%20People",
    "https://example.test/deezer.com/track/4275996402",
    "https://user@www.deezer.com/track/4275996402",
  ])("does not offer refresh through an invalid provider identity: %s", async (url) => {
    repository.loadByShortId.mockImplementation(async () =>
      trackShareResult(EXPIRED_URL, [{ service: "deezer", url }]),
    );
    const share = await get(`/api/v1/share/${SHORT_ID}`);
    expect(share.json().track.previewRefreshable).toBeUndefined();
    const preview = await get(`/api/v1/share/${SHORT_ID}/preview`);
    expect(preview.json()).toEqual({ previewUrl: null });
    expect(deezer.getTrack).not.toHaveBeenCalled();
  });

  it("returns a usable stored track preview without a provider request", async () => {
    repository.loadByShortId.mockImplementation(async () => trackShareResult(VALID_URL));
    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);
    expect(response.json()).toEqual({ previewUrl: VALID_URL });
    expect(deezer.getTrack).not.toHaveBeenCalled();
  });

  it("offers and returns a fresh preview through the confirmed Deezer recording link", async () => {
    repository.loadByShortId.mockImplementation(async () => trackShareResult(EXPIRED_URL));
    deezer.getTrack.mockResolvedValue({
      sourceService: "deezer",
      sourceId: "4275996402",
      title: "Hurt People",
      artists: ["DARKK"],
      durationMs: 201000,
      webUrl: "https://www.deezer.com/track/4275996402",
      previewUrl: FRESH_URL,
    });

    const share = await get(`/api/v1/share/${SHORT_ID}`);
    expect(share.statusCode).toBe(200);
    expect(share.json().track.previewUrl).toBeUndefined();
    expect(share.json().track.previewRefreshable).toBe(true);

    const preview = await get(`/api/v1/share/${SHORT_ID}/preview`);
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ previewUrl: FRESH_URL });
    expect(deezer.getTrack).toHaveBeenCalledWith("4275996402");
    expect(repository.upsertTrackPreview).toHaveBeenCalledWith("track-1", {
      service: "deezer",
      url: FRESH_URL,
      expiresAt: new Date(VALID_TOKEN_SECONDS * 1000),
    });
  });
});

describe("album share response", () => {
  it("drops an expired Deezer preview and marks the album refreshable", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(albumShareResult(EXPIRED_URL));

    const response = await get(`/api/v1/share/${SHORT_ID}`);

    expect(response.statusCode).toBe(200);
    const { album } = response.json();
    expect(album.previewUrl).toBeUndefined();
    expect(album.previewRefreshable).toBe(true);
  });

  it("keeps a valid preview and leaves the refresh flag out", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(albumShareResult(VALID_URL));

    const { album } = (await get(`/api/v1/share/${SHORT_ID}`)).json();

    expect(album.previewUrl).toBe(VALID_URL);
    expect(album).not.toHaveProperty("previewRefreshable");
  });

  it("does not offer a refresh for an album without a Deezer album link", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(
      albumShareResult(EXPIRED_URL, [{ service: "spotify", url: "https://open.spotify.com/album/abc" }]),
    );

    const { album } = (await get(`/api/v1/share/${SHORT_ID}`)).json();

    expect(album.previewUrl).toBeUndefined();
    expect(album).not.toHaveProperty("previewRefreshable");
  });
});

describe("album preview refresh", () => {
  it("fetches the album from Deezer by its link, stores the preview with its expiry and returns it", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(albumShareResult(EXPIRED_URL));
    deezer.getAlbum.mockResolvedValue({ topTrackPreviewUrl: FRESH_URL });

    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ previewUrl: FRESH_URL });
    expect(deezer.getAlbum).toHaveBeenCalledWith(DEEZER_ALBUM_ID);
    expect(repository.upsertAlbumPreview).toHaveBeenCalledWith("album-1", {
      service: "deezer",
      url: FRESH_URL,
      expiresAt: new Date(VALID_TOKEN_SECONDS * 1000),
    });
  });

  it("returns a valid stored preview without asking Deezer", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(albumShareResult(VALID_URL));

    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);

    expect(response.json()).toEqual({ previewUrl: VALID_URL });
    expect(deezer.getAlbum).not.toHaveBeenCalled();
  });

  it("answers null when the Deezer lookup fails", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(albumShareResult(EXPIRED_URL));
    deezer.getAlbum.mockRejectedValue(new Error("Deezer album lookup failed"));

    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ previewUrl: null });
    expect(repository.upsertAlbumPreview).not.toHaveBeenCalled();
  });

  it("answers 404 for a code that names no track and no album", async () => {
    repository.loadAlbumByShortId.mockResolvedValue(null);

    const response = await get(`/api/v1/share/${SHORT_ID}/preview`);

    expect(response.statusCode).toBe(404);
  });
});

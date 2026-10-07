import type { CcArtistInfoResponse, VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const persistCcTrack = vi.fn();
const persistCcAlbum = vi.fn();
const persistCcArtist = vi.fn();
const commercialRepository = { kind: "commercial" };

vi.mock("../db/index.js", () => ({
  getCcRepository: vi.fn().mockResolvedValue({ persistCcTrack, persistCcAlbum, persistCcArtist }),
  getRepository: vi.fn().mockResolvedValue(commercialRepository),
}));

vi.mock("../lib/env.js", () => ({
  requireEnvList: vi.fn().mockReturnValue(["http://localhost:3000"]),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  siteResolveRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
}));

const resolveCcCandidate = vi.fn();
const resolveCcTextSearch = vi.fn();
// The candidate-id builders stay real, so a test sees the id a pasted link
// actually turns into; only the two Jamendo-facing calls are replaced.
vi.mock("../services/cc/cc-resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/cc/cc-resolver.js")>()),
  resolveCcCandidate,
  resolveCcTextSearch,
}));

const ARTIST_INFO: CcArtistInfoResponse = {
  artistName: "Jimmy Smith",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

vi.mock("../services/cc/cc-share-response.js", () => ({
  buildCcAlbumPayload: vi.fn((album: Record<string, unknown>, tracks: Array<Record<string, unknown>>) =>
    Promise.resolve({
      album: {
        jamendoId: album.jamendoId,
        name: album.name,
        artistName: album.artistName,
        tracks: tracks.map((track) => ({
          jamendoId: track.jamendoId,
          title: track.title,
          artistName: track.artistName,
          jamendoArtistId: track.jamendoArtistId,
          albumName: track.albumName,
          streamUrl: track.streamUrl,
          downloadAllowed: track.downloadAllowed,
        })),
      },
      artistInfo: ARTIST_INFO,
    }),
  ),
  buildCcArtistPayload: vi.fn((artist: Record<string, unknown>, topTracks: Array<Record<string, unknown>>) =>
    Promise.resolve({
      artist: {
        ...artist,
        topTracks: topTracks.map((track) => ({
          jamendoId: track.jamendoId,
          title: track.title,
          artistName: track.artistName,
          jamendoArtistId: track.jamendoArtistId,
          albumName: track.albumName,
          streamUrl: track.streamUrl,
          downloadAllowed: track.downloadAllowed,
        })),
      },
      artistInfo: ARTIST_INFO,
    }),
  ),
  ccTrackToPersistData: vi.fn((track: unknown) => track),
  toApiCcTrack: vi.fn((track: Record<string, unknown>) => ({
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    jamendoArtistId: track.jamendoArtistId,
    albumName: track.albumName,
    streamUrl: track.streamUrl,
    downloadAllowed: track.downloadAllowed,
  })),
}));

const resolveTrackVinylLayout = vi.fn();
const resolveAlbumVinylLayout = vi.fn();
vi.mock("../services/track-vinyl-layout.js", () => ({ resolveTrackVinylLayout, resolveAlbumVinylLayout }));

const { default: ccResolveRoutes } = await import("./cc-resolve.js");

const VINYL_LAYOUT: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1_210_000 }] }],
};

const TRACK = {
  jamendoId: "101",
  title: "The Sermon!",
  artistName: "Jimmy Smith",
  jamendoArtistId: "201",
  albumName: "The Sermon!",
  jamendoAlbumId: "301",
  streamUrl: "https://cdn.example/track.mp3",
  downloadAllowed: false,
};

const ALBUM = {
  jamendoId: "301",
  name: "The Sermon!",
  artistName: "Jimmy Smith",
  jamendoArtistId: "201",
};

function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) app.addSchema(schema);
  app.register(ccResolveRoutes);
  return app;
}

describe("POST /api/v1/cc/resolve vinyl layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves and returns the containing album layout for a CC track", async () => {
    resolveCcCandidate.mockResolvedValue({ kind: "track", track: TRACK });
    persistCcTrack.mockResolvedValue({ ccTrackId: "cc-track-id", shortId: "track-short" });
    resolveTrackVinylLayout.mockResolvedValue(VINYL_LAYOUT);
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cc/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { selectedCandidate: "jamendo:101" },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(resolveTrackVinylLayout).toHaveBeenCalledWith(commercialRepository, {
      artists: ["Jimmy Smith"],
      albumName: "The Sermon!",
    });
    expect(response.json().track.vinylLayout).toEqual(VINYL_LAYOUT);
    await app.close();
  });

  it("resolves and returns the album layout for a CC album", async () => {
    resolveCcCandidate.mockResolvedValue({ kind: "album", album: ALBUM, tracks: [TRACK] });
    persistCcAlbum.mockResolvedValue({ ccAlbumId: "cc-album-id", shortId: "album-short" });
    resolveAlbumVinylLayout.mockResolvedValue(VINYL_LAYOUT);
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cc/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { selectedCandidate: "jamendo-album:301" },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(resolveAlbumVinylLayout).toHaveBeenCalledWith(commercialRepository, {
      artists: ["Jimmy Smith"],
      title: "The Sermon!",
    });
    expect(response.json().album.vinylLayout).toEqual(VINYL_LAYOUT);
    await app.close();
  });

  it("does not request a vinyl layout for a CC artist", async () => {
    resolveCcCandidate.mockResolvedValue({
      kind: "artist",
      artist: { jamendoId: "201", name: "Jimmy Smith" },
      topTracks: [TRACK],
    });
    persistCcArtist.mockResolvedValue({ ccArtistId: "cc-artist-id", shortId: "artist-short" });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cc/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { selectedCandidate: "jamendo-artist:201" },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(resolveTrackVinylLayout).not.toHaveBeenCalled();
    expect(resolveAlbumVinylLayout).not.toHaveBeenCalled();
    expect(response.json().artist).not.toHaveProperty("vinylLayout");
    await app.close();
  });

  it("rejects a body that supplies both a query and a selected candidate", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cc/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: "ambient", selectedCandidate: "jamendo:track-1" },
    });

    expect(response.statusCode).toBe(400);
    expect(resolveCcCandidate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /api/v1/cc/resolve Jamendo links", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function resolveQuery(query: string) {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cc/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query },
    });
    await app.close();
    return response;
  }

  it("resolves a pasted track link to that track without a text search", async () => {
    resolveCcCandidate.mockResolvedValue({ kind: "track", track: TRACK });
    persistCcTrack.mockResolvedValue({ ccTrackId: "cc-track-id", shortId: "track-short" });
    resolveTrackVinylLayout.mockResolvedValue(null);

    const response = await resolveQuery("https://jamendo.com/track/101");

    expect(response.statusCode, response.body).toBe(200);
    expect(resolveCcCandidate).toHaveBeenCalledWith("jamendo:101");
    expect(resolveCcTextSearch).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({ type: "cc-track", shortUrl: "http://localhost:3000/track-short" });
  });

  it("resolves album and artist links, including a language segment", async () => {
    resolveCcCandidate.mockResolvedValue({ kind: "album", album: ALBUM, tracks: [TRACK] });
    persistCcAlbum.mockResolvedValue({ ccAlbumId: "cc-album-id", shortId: "album-short" });
    resolveAlbumVinylLayout.mockResolvedValue(null);
    expect((await resolveQuery("https://www.jamendo.com/de/album/301/the-sermon")).statusCode).toBe(200);
    expect(resolveCcCandidate).toHaveBeenLastCalledWith("jamendo-album:301");

    resolveCcCandidate.mockResolvedValue({
      kind: "artist",
      artist: { jamendoId: "201", name: "Jimmy Smith" },
      topTracks: [TRACK],
    });
    persistCcArtist.mockResolvedValue({ ccArtistId: "cc-artist-id", shortId: "artist-short" });
    expect((await resolveQuery("www.jamendo.com/artist/201")).statusCode).toBe(200);
    expect(resolveCcCandidate).toHaveBeenLastCalledWith("jamendo-artist:201");
    expect(resolveCcTextSearch).not.toHaveBeenCalled();
  });

  it("answers 404 when Jamendo has no entity behind the link", async () => {
    resolveCcCandidate.mockResolvedValue(null);

    const response = await resolveQuery("https://www.jamendo.com/track/999999999");

    expect(response.statusCode).toBe(404);
    expect(resolveCcCandidate).toHaveBeenCalledWith("jamendo:999999999");
  });

  it("keeps sending free text to the text search", async () => {
    resolveCcTextSearch.mockResolvedValue({ candidates: [] });

    const response = await resolveQuery("ambient piano");

    expect(response.statusCode, response.body).toBe(200);
    expect(resolveCcTextSearch).toHaveBeenCalledWith("ambient piano");
    expect(resolveCcCandidate).not.toHaveBeenCalled();
  });
});

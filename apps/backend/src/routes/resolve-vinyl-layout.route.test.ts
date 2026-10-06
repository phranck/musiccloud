import type { AlbumResolveSuccessResponse, ApiTrack, VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const persistAlbumWithLinks = vi.fn();
const enrichVinylLayout = vi.fn();
const readVinylLayout = vi.fn();
const persistResolution = vi.fn();

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue({
    persistAlbumWithLinks,
    enrichVinylLayout,
    readVinylLayout,
    upsertAlbumPreview: vi.fn(),
    addAlbumExternalIds: vi.fn(),
  }),
}));

vi.mock("../lib/env.js", () => ({
  requireEnvList: vi.fn().mockReturnValue(["http://localhost:3000"]),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn(), error: vi.fn(), deviation: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  siteResolveRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
}));

vi.mock("../lib/platform/url.js", () => ({
  isAlbumUrl: vi.fn().mockReturnValue(true),
  isArtistUrl: vi.fn().mockReturnValue(false),
  isUrl: vi.fn().mockReturnValue(true),
  stripTrackingParams: vi.fn((url: string) => url),
}));

vi.mock("../services/album-resolver.js", () => ({
  resolveAlbumUrl: vi.fn(),
}));

vi.mock("../services/resolver.js", () => ({
  expandShortLink: vi.fn((url: string) => url),
  resolveQuery: vi.fn(),
  resolveSelectedCandidate: vi.fn(),
  resolveTextSearchWithDisambiguation: vi.fn(),
}));

vi.mock("../services/persist-resolution.js", () => ({ persistResolution }));

const { default: resolveRoutes } = await import("./resolve.js");
const { resolveAlbumUrl } = await import("../services/album-resolver.js");
const { resolveQuery } = await import("../services/resolver.js");
const { isAlbumUrl } = await import("../lib/platform/url.js");

const vinylLayout = {
  discogsReleaseId: "15815903",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
};

const albumResolution = {
  sourceAlbum: {
    title: "The Sermon!",
    artists: ["Jimmy Smith"],
    upc: "094635000000",
    sourceService: "spotify" as const,
    sourceId: "album-1",
    webUrl: "https://open.spotify.com/album/album-1",
  },
  links: [],
  externalIds: [],
};

function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) {
    app.addSchema(schema);
  }
  app.register(resolveRoutes);
  return app;
}

function buildAlbumSerializerApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  for (const schema of OPENAPI_SCHEMAS) {
    app.addSchema(schema);
  }
  app.get(
    "/album-serializer-contract",
    {
      schema: {
        response: {
          200: { $ref: "AlbumResolveSuccess#" },
        },
      },
    },
    async () => ({
      type: "album",
      id: "persisted-album-id",
      shortUrl: "http://localhost:3000/album-short",
      album: {
        title: "The Sermon!",
        artists: ["Jimmy Smith"],
        vinylLayout,
      },
      links: [],
    }),
  );
  return app;
}

describe("POST /api/v1/resolve album vinyl layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAlbumUrl).mockReturnValue(true);
  });

  it("requires vinylLayout in the shared album resolve contract", () => {
    expectTypeOf<AlbumResolveSuccessResponse["album"]["vinylLayout"]>().toEqualTypeOf<VinylLayout | null>();
  });

  it("exposes the artist-qualified album layout on a track resolve", async () => {
    expectTypeOf<ApiTrack["vinylLayout"]>().toEqualTypeOf<VinylLayout | null>();
    vi.mocked(isAlbumUrl).mockReturnValue(false);
    persistResolution.mockResolvedValue({
      trackId: "track-id",
      shortId: "track-short",
      refreshedPreviewUrl: undefined,
      artistCredits: [],
    });
    readVinylLayout.mockResolvedValue(vinylLayout);
    vi.mocked(resolveQuery).mockResolvedValue({
      sourceTrack: {
        title: "The Sermon!",
        artists: ["Jimmy Smith"],
        albumName: "The Sermon!",
        sourceService: "spotify",
        sourceId: "track-1",
        webUrl: "https://open.spotify.com/track/track-1",
      },
      links: [],
      externalIds: [],
    });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: "https://open.spotify.com/track/track-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().track.vinylLayout).toEqual(vinylLayout);
    expect(readVinylLayout).toHaveBeenCalledWith("jimmy smith::the sermon");
    await app.close();
  });

  it("normalizes a fresh YouTube timestamp for the unified track response", async () => {
    vi.mocked(isAlbumUrl).mockReturnValue(false);
    persistResolution.mockResolvedValue({
      trackId: "youtube-track-id",
      shortId: "youtube-short",
      refreshedPreviewUrl: undefined,
      artistCredits: [],
    });
    vi.mocked(resolveQuery).mockResolvedValue({
      sourceTrack: {
        title: "Our Song",
        artists: ["Taylor Swift"],
        sourceService: "youtube",
        sourceId: "Jb2stN7kH28",
        webUrl: "https://www.youtube.com/watch?v=Jb2stN7kH28",
        releaseDate: "2009-06-17T00:49:50Z",
      },
      links: [
        {
          service: "youtube",
          displayName: "YouTube",
          url: "https://www.youtube.com/watch?v=Jb2stN7kH28",
          confidence: 1,
          matchMethod: "isrc",
        },
      ],
      externalIds: [],
    });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: "https://youtu.be/Jb2stN7kH28?si=MU88B8DjtcBc-Ps5" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().track.releaseDate).toBe("2009-06-17");

    await app.close();
  });

  it("preserves vinylLayout through the AlbumResolveSuccess serializer", async () => {
    const app = buildAlbumSerializerApp();

    const response = await app.inject({
      method: "GET",
      url: "/album-serializer-contract",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);

    await app.close();
  });

  it("normalizes a fresh album timestamp for the unified album response", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    enrichVinylLayout.mockResolvedValue(undefined);
    readVinylLayout.mockResolvedValue(null);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({
      ...albumResolution,
      sourceAlbum: {
        ...albumResolution.sourceAlbum,
        releaseDate: "2014-10-27T00:00:00Z",
      },
    });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.releaseDate).toBe("2014-10-27");

    await app.close();
  });

  /**
   * Discogs needs at least three requests through a queue spaced 1.1 s apart,
   * so the album response answers without a layout and the enrichment runs
   * after it, against the album that was just persisted.
   */
  it("answers before the vinyl enrichment and starts it after persistence", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    enrichVinylLayout.mockReturnValue(new Promise(() => {}));
    readVinylLayout.mockResolvedValue(undefined);
    vi.mocked(resolveAlbumUrl).mockResolvedValue(albumResolution);
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.vinylLayout).toBeNull();
    expect(enrichVinylLayout).toHaveBeenCalledWith({
      identityKey: "jimmy smith::the sermon",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      albumId: "persisted-album-id",
    });
    expect(persistAlbumWithLinks.mock.invocationCallOrder[0]).toBeLessThan(
      enrichVinylLayout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    await app.close();
  });

  it("returns the resolved album when vinyl enrichment fails", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    enrichVinylLayout.mockRejectedValue(new Error("Discogs unavailable"));
    readVinylLayout.mockResolvedValue(undefined);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({
      ...albumResolution,
      sourceAlbum: { ...albumResolution.sourceAlbum, title: "Back at the Chicken Shack" },
    });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichVinylLayout).toHaveBeenCalledWith(
      expect.objectContaining({ identityKey: "jimmy smith::back at the chicken shack" }),
    );
    expect(response.json().album.vinylLayout).toBeNull();

    await app.close();
  });

  it("serves a cached album layout without repeating Discogs enrichment", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    readVinylLayout.mockResolvedValue(vinylLayout);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({ ...albumResolution, albumId: "cached-album-id" });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichVinylLayout).not.toHaveBeenCalled();
    expect(readVinylLayout).toHaveBeenCalledWith("jimmy smith::the sermon");
    expect(readVinylLayout).not.toHaveBeenCalledWith("cached-album-id");
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);

    await app.close();
  });

  it("serves a cached album negative vinyl lookup as null without repeating Discogs enrichment", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    readVinylLayout.mockResolvedValue(null);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({ ...albumResolution, albumId: "cached-album-id" });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichVinylLayout).not.toHaveBeenCalled();
    expect(readVinylLayout).toHaveBeenCalledWith("jimmy smith::the sermon");
    expect(readVinylLayout).not.toHaveBeenCalledWith("cached-album-id");
    expect(response.json().album.vinylLayout).toBeNull();

    await app.close();
  });
});

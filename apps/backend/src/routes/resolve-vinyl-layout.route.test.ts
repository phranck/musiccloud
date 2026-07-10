import type { AlbumResolveSuccessResponse, ApiTrack, VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const persistAlbumWithLinks = vi.fn();
const enrichAlbumVinylLayout = vi.fn();
const readAlbumVinylLayout = vi.fn();
const findAlbumByVinylLayoutIdentity = vi.fn();
const ensureAlbumVinylLayoutIdentity = vi.fn((_identityKey: string, albumId: string) => Promise.resolve(albumId));
const persistResolution = vi.fn();

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue({
    persistAlbumWithLinks,
    enrichAlbumVinylLayout,
    readAlbumVinylLayout,
    findAlbumByVinylLayoutIdentity,
    ensureAlbumVinylLayoutIdentity,
    upsertAlbumPreview: vi.fn(),
    addAlbumExternalIds: vi.fn(),
  }),
}));

vi.mock("../lib/env.js", () => ({
  requireEnvList: vi.fn().mockReturnValue(["http://localhost:3000"]),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
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
    findAlbumByVinylLayoutIdentity.mockResolvedValue({ albumId: "persisted-album-id" });
    readAlbumVinylLayout.mockResolvedValue(vinylLayout);
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
    expect(findAlbumByVinylLayoutIdentity).toHaveBeenCalledWith("jimmy smith::the sermon");
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

  it("enriches after persistence and returns the persisted vinyl layout", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    enrichAlbumVinylLayout.mockResolvedValue(undefined);
    readAlbumVinylLayout.mockResolvedValue(vinylLayout);
    vi.mocked(resolveAlbumUrl).mockResolvedValue(albumResolution);
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichAlbumVinylLayout).toHaveBeenCalledWith({
      id: "persisted-album-id",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      upc: "094635000000",
    });
    expect(readAlbumVinylLayout).toHaveBeenCalledWith("persisted-album-id");
    expect(persistAlbumWithLinks.mock.invocationCallOrder[0]).toBeLessThan(
      enrichAlbumVinylLayout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(enrichAlbumVinylLayout.mock.invocationCallOrder[0]).toBeLessThan(
      readAlbumVinylLayout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);

    await app.close();
  });

  it("returns the resolved album when vinyl enrichment fails", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    enrichAlbumVinylLayout.mockRejectedValue(new Error("Discogs unavailable"));
    readAlbumVinylLayout.mockResolvedValue(undefined);
    vi.mocked(resolveAlbumUrl).mockResolvedValue(albumResolution);
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichAlbumVinylLayout).toHaveBeenCalledWith({
      id: "persisted-album-id",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      upc: "094635000000",
    });
    expect(readAlbumVinylLayout).toHaveBeenCalledWith("persisted-album-id");
    expect(persistAlbumWithLinks.mock.invocationCallOrder[0]).toBeLessThan(
      enrichAlbumVinylLayout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(enrichAlbumVinylLayout.mock.invocationCallOrder[0]).toBeLessThan(
      readAlbumVinylLayout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
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
    readAlbumVinylLayout.mockResolvedValue(vinylLayout);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({ ...albumResolution, albumId: "cached-album-id" });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichAlbumVinylLayout).not.toHaveBeenCalled();
    expect(readAlbumVinylLayout).toHaveBeenCalledWith("persisted-album-id");
    expect(readAlbumVinylLayout).not.toHaveBeenCalledWith("cached-album-id");
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);

    await app.close();
  });

  it("serves a cached album negative vinyl lookup as null without repeating Discogs enrichment", async () => {
    persistAlbumWithLinks.mockResolvedValue({
      albumId: "persisted-album-id",
      shortId: "album-short",
      artistCredits: [],
    });
    readAlbumVinylLayout.mockResolvedValue(null);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({ ...albumResolution, albumId: "cached-album-id" });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: albumResolution.sourceAlbum.webUrl },
    });

    expect(response.statusCode).toBe(200);
    expect(enrichAlbumVinylLayout).not.toHaveBeenCalled();
    expect(readAlbumVinylLayout).toHaveBeenCalledWith("persisted-album-id");
    expect(readAlbumVinylLayout).not.toHaveBeenCalledWith("cached-album-id");
    expect(response.json().album.vinylLayout).toBeNull();

    await app.close();
  });
});

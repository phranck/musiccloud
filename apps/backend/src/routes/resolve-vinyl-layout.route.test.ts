import type { AlbumResolveSuccessResponse, VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const persistAlbumWithLinks = vi.fn();
const enrichAlbumVinylLayout = vi.fn();
const readAlbumVinylLayout = vi.fn();

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue({
    persistAlbumWithLinks,
    enrichAlbumVinylLayout,
    readAlbumVinylLayout,
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

const { default: resolveRoutes } = await import("./resolve.js");
const { resolveAlbumUrl } = await import("../services/album-resolver.js");

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
  });

  it("requires vinylLayout in the shared album resolve contract", () => {
    expectTypeOf<AlbumResolveSuccessResponse["album"]["vinylLayout"]>().toEqualTypeOf<VinylLayout | null>();
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
});

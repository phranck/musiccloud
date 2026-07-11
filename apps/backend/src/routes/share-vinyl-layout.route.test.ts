import type { VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const enrichAlbumVinylLayout = vi.fn();
const readAlbumVinylLayout = vi.fn();
const findAlbumByVinylLayoutIdentity = vi.fn();
const loadAlbumByShortId = vi.fn();
const loadCcByShortId = vi.fn();

const repository = {
  loadByShortId: vi.fn().mockResolvedValue(null),
  loadAlbumByShortId,
  loadArtistByShortId: vi.fn().mockResolvedValue(null),
  enrichAlbumVinylLayout,
  readAlbumVinylLayout,
  findAlbumByVinylLayoutIdentity,
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(repository),
  getCcRepository: vi.fn().mockResolvedValue({
    findCcShortId: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/server/cc-share-page.js", () => ({ loadCcByShortId }));

const { default: shareRoutes } = await import("./share.js");

const vinylLayout: VinylLayout = {
  discogsReleaseId: "15815903",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
};

function buildAlbumShareResult(layout: VinylLayout | null) {
  return {
    album: {
      title: "The Sermon!",
      artworkUrl: "https://example.com/the-sermon.jpg",
      releaseDate: "1959-01-01",
      totalTracks: 3,
      label: "Blue Note",
      upc: "094635000000",
      previewUrl: null,
      vinylLayout: layout,
    },
    artists: ["Jimmy Smith"],
    artistCredits: [],
    artistDisplay: "Jimmy Smith",
    shortId: "album-short",
    links: [],
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
  return app;
}

describe("GET /api/v1/share/:shortId album vinyl layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
    repository.loadByShortId.mockResolvedValue(null);
    repository.loadArtistByShortId.mockResolvedValue(null);
    loadCcByShortId.mockResolvedValue(null);
  });

  it("returns a persisted positive vinyl layout without enrichment", async () => {
    loadAlbumByShortId.mockResolvedValue(buildAlbumShareResult(vinylLayout));
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/share/album-short" });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);
    expect(enrichAlbumVinylLayout).not.toHaveBeenCalled();
    expect(readAlbumVinylLayout).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns a persisted negative vinyl lookup as null without enrichment", async () => {
    loadAlbumByShortId.mockResolvedValue(buildAlbumShareResult(null));
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/share/album-short" });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.vinylLayout).toBeNull();
    expect(enrichAlbumVinylLayout).not.toHaveBeenCalled();
    expect(readAlbumVinylLayout).not.toHaveBeenCalled();

    await app.close();
  });

  it("reads the artist-qualified layout owner when it differs from the shared album row", async () => {
    loadAlbumByShortId.mockResolvedValue(buildAlbumShareResult(null));
    findAlbumByVinylLayoutIdentity.mockResolvedValue({ albumId: "layout-owner" });
    readAlbumVinylLayout.mockResolvedValue(vinylLayout);
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/share/album-short" });

    expect(response.statusCode).toBe(200);
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);
    expect(readAlbumVinylLayout).toHaveBeenCalledWith("layout-owner");

    await app.close();
  });
});

describe("GET /api/v1/share/:shortId CC refresh caching", () => {
  afterEach(() => {
    vi.clearAllMocks();
    repository.loadByShortId.mockResolvedValue(null);
    repository.loadAlbumByShortId.mockResolvedValue(null);
    repository.loadArtistByShortId.mockResolvedValue(null);
    loadCcByShortId.mockResolvedValue(null);
  });

  it("prevents browser caching while CC share reloads force Discogs refreshes", async () => {
    loadAlbumByShortId.mockResolvedValue(null);
    loadCcByShortId.mockResolvedValue({
      type: "cc-track",
      og: {
        title: "Moments - Madpix",
        description: "Listen to Moments by Madpix",
        image: "https://example.com/moments.jpg",
        url: "https://musiccloud.io/V0onz",
      },
      shortUrl: "https://musiccloud.io/V0onz",
      track: { title: "Moments", artistName: "Madpix", vinylLayout },
    });
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/share/V0onz" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");

    await app.close();
  });

  it("keeps normal browser caching for CC artist shares without Discogs refreshes", async () => {
    loadAlbumByShortId.mockResolvedValue(null);
    loadCcByShortId.mockResolvedValue({
      type: "cc-artist",
      og: {
        title: "Madpix - musiccloud",
        description: "Listen to Madpix on musiccloud",
        image: "https://example.com/madpix.jpg",
        url: "https://musiccloud.io/N3VoA",
      },
      shortUrl: "https://musiccloud.io/N3VoA",
      artist: { name: "Madpix", topTracks: [] },
      artistInfo: { artistName: "Madpix", topTracks: [], profile: null, events: [] },
    });
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/share/N3VoA" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, max-age=3600");

    await app.close();
  });
});

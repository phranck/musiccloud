import type { VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const enrichAlbumVinylLayout = vi.fn();
const readAlbumVinylLayout = vi.fn();
const loadAlbumByShortId = vi.fn();

const repository = {
  loadByShortId: vi.fn().mockResolvedValue(null),
  loadAlbumByShortId,
  loadArtistByShortId: vi.fn().mockResolvedValue(null),
  enrichAlbumVinylLayout,
  readAlbumVinylLayout,
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
});

import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  const app = Fastify({ ajv: { customOptions: { strict: false } } });
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));
  app.register(resolveRoutes);
  return app;
}

describe("POST /api/v1/resolve album vinyl layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enriches after persistence and returns the persisted vinyl layout", async () => {
    persistAlbumWithLinks.mockResolvedValue({ albumId: "album-1", shortId: "album-short", artistCredits: [] });
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
      id: "album-1",
      title: "The Sermon!",
      artists: ["Jimmy Smith"],
      upc: "094635000000",
    });
    expect(enrichAlbumVinylLayout.mock.invocationCallOrder[0]).toBeGreaterThan(
      persistAlbumWithLinks.mock.invocationCallOrder[0] ?? 0,
    );
    expect(response.json().album.vinylLayout).toEqual(vinylLayout);

    await app.close();
  });

  it("returns the resolved album when vinyl enrichment fails", async () => {
    persistAlbumWithLinks.mockResolvedValue({ albumId: "album-1", shortId: "album-short", artistCredits: [] });
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
    expect(response.json().album.vinylLayout).toBeNull();

    await app.close();
  });
});

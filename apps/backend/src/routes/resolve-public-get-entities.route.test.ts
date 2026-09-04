import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const persistAlbumWithLinks = vi.fn();
const persistArtistWithLinks = vi.fn();
const persistResolution = vi.fn();
const readVinylLayout = vi.fn().mockResolvedValue(null);

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue({
    persistAlbumWithLinks,
    persistArtistWithLinks,
    readVinylLayout,
    enrichVinylLayout: vi.fn(),
    upsertAlbumPreview: vi.fn(),
    addAlbumExternalIds: vi.fn(),
    addArtistExternalIds: vi.fn(),
  }),
}));

vi.mock("../lib/env.js", () => ({
  requireEnvList: vi.fn().mockReturnValue(["http://localhost:3000"]),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn(), error: vi.fn(), deviation: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  checkKeylessResolveBudget: vi.fn().mockReturnValue({ limited: false }),
  KEYLESS_RESOLVE_REQUESTS_PER_MINUTE: 10,
  KEYLESS_RESOLVE_REQUESTS_PER_DAY: 500,
}));

vi.mock("../lib/platform/url.js", () => ({
  isAlbumUrl: vi.fn().mockReturnValue(false),
  isArtistUrl: vi.fn().mockReturnValue(false),
  isUrl: vi.fn().mockReturnValue(true),
  stripTrackingParams: vi.fn((url: string) => url),
}));

vi.mock("../services/album-resolver.js", () => ({ resolveAlbumUrl: vi.fn() }));
vi.mock("../services/artist-resolver.js", () => ({ resolveArtistUrl: vi.fn() }));
vi.mock("../services/track-vinyl-layout.js", () => ({ resolveTrackVinylLayout: vi.fn().mockResolvedValue(null) }));
vi.mock("../services/persist-resolution.js", () => ({ persistResolution }));

vi.mock("../services/resolver.js", () => ({
  expandShortLink: vi.fn(async (url: string) => url),
  resolveQuery: vi.fn(),
  resolveTextSearchWithDisambiguation: vi.fn(),
}));

const { default: resolvePublicGetRoutes } = await import("./resolve-public-get.js");
const { resolveAlbumUrl } = await import("../services/album-resolver.js");
const { resolveArtistUrl } = await import("../services/artist-resolver.js");
const { resolveQuery } = await import("../services/resolver.js");
const { isAlbumUrl, isArtistUrl } = await import("../lib/platform/url.js");

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
  app.register(resolvePublicGetRoutes);
  return app;
}

function get(app: ReturnType<typeof buildApp>, url: string) {
  return app.inject({ method: "GET", url, headers: { origin: "http://localhost:3000" } });
}

const ALBUM_URL = "https://open.spotify.com/album/album-1";
const ARTIST_URL = "https://open.spotify.com/artist/artist-1";

afterEach(() => {
  vi.mocked(isAlbumUrl).mockReturnValue(false);
  vi.mocked(isArtistUrl).mockReturnValue(false);
  vi.clearAllMocks();
  readVinylLayout.mockResolvedValue(null);
});

/**
 * The GET operation is documented as the one-request companion to the POST one,
 * so an input that resolves there has to resolve here. Before this routing
 * existed, an album or artist URL fell through to the track pipeline and came
 * back as "unrecognized music service URL", which was untrue: the URL was
 * recognised, the operation simply could not use it.
 */
describe("GET /api/v1/resolve content-type routing", () => {
  it("resolves an album URL to the album variant", async () => {
    vi.mocked(isAlbumUrl).mockReturnValue(true);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({
      sourceAlbum: { title: "The Sermon!", artists: ["Jimmy Smith"], webUrl: ALBUM_URL },
      links: [],
      externalIds: [],
      // biome-ignore lint/suspicious/noExplicitAny: the resolver's full result type is not the subject here
    } as any);
    persistAlbumWithLinks.mockResolvedValue({ albumId: "alb-1", shortId: "aBc", artistCredits: [] });

    const app = buildApp();
    const response = await get(app, `/api/v1/resolve?query=${encodeURIComponent(ALBUM_URL)}`);

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.type).toBe("album");
    expect(body.album.title).toBe("The Sermon!");
    expect(body.shortUrl).toBe("http://localhost:3000/aBc");
    expect(resolveQuery).not.toHaveBeenCalled();

    await app.close();
  });

  it("resolves an artist URL to the artist variant", async () => {
    vi.mocked(isArtistUrl).mockReturnValue(true);
    vi.mocked(resolveArtistUrl).mockResolvedValue({
      sourceArtist: { name: "Jimmy Smith", genres: ["jazz"], webUrl: ARTIST_URL },
      links: [],
      externalIds: [],
      // biome-ignore lint/suspicious/noExplicitAny: the resolver's full result type is not the subject here
    } as any);
    persistArtistWithLinks.mockResolvedValue({ artistId: "art-1", shortId: "dEf" });

    const app = buildApp();
    const response = await get(app, `/api/v1/resolve?query=${encodeURIComponent(ARTIST_URL)}`);

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.type).toBe("artist");
    expect(body.artist.name).toBe("Jimmy Smith");
    expect(resolveQuery).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns only the share URL for an album when format is text", async () => {
    vi.mocked(isAlbumUrl).mockReturnValue(true);
    vi.mocked(resolveAlbumUrl).mockResolvedValue({
      sourceAlbum: { title: "The Sermon!", artists: ["Jimmy Smith"], webUrl: ALBUM_URL },
      links: [],
      externalIds: [],
      // biome-ignore lint/suspicious/noExplicitAny: the resolver's full result type is not the subject here
    } as any);
    persistAlbumWithLinks.mockResolvedValue({ albumId: "alb-1", shortId: "aBc", artistCredits: [] });

    const app = buildApp();
    const response = await get(app, `/api/v1/resolve?query=${encodeURIComponent(ALBUM_URL)}&format=text`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toBe("http://localhost:3000/aBc");

    await app.close();
  });

  /**
   * Both operations build their response through the same helper, so a source
   * that reports only a year has to come back the same way from either. A bare
   * year is not a release date, and the shared helper drops it.
   */
  it("drops a bare release year, as the POST operation does", async () => {
    vi.mocked(resolveQuery).mockResolvedValue({
      sourceTrack: { title: "The Sermon", artists: ["Jimmy Smith"], releaseDate: "1958" },
      links: [],
      externalIds: [],
      // biome-ignore lint/suspicious/noExplicitAny: the resolver's full result type is not the subject here
    } as any);
    persistResolution.mockResolvedValue({
      trackId: "trk-1",
      shortId: "gHi",
      refreshedPreviewUrl: undefined,
      artistCredits: [],
    });

    const app = buildApp();
    const response = await get(app, "/api/v1/resolve?query=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Ft1");

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.type).toBe("track");
    expect(body.track.releaseDate).toBeUndefined();

    await app.close();
  });
});

import { ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

/** Stands in for the artwork table, so no test reaches a database. */
const getCachedArtwork = vi.fn();
/** Stands in for the generator, so no test renders an image. */
const ensureArtwork = vi.fn();

/** Stands in for the browse grid's cover cache; answers `null` unless a test sets a cover. */
const getCachedGenreCoverUrl = vi.fn();
/** Stands in for the Last.fm cover lookup; answers `null` unless a test sets a cover. */
const getGenreCoverUrl = vi.fn();
/** Stands in for the Jamendo cover lookup; answers `null` unless a test sets a cover. */
const getCcGenreCoverUrl = vi.fn();
/** Stands in for the Jamendo station list; answers `[]` unless a test sets stations. */
const getCcGenres = vi.fn();

vi.mock("../services/genre-artwork/index.js", async () => ({
  ...(await import("../services/genre-artwork/genre-key.js")),
  ensureArtwork,
  getCachedArtwork,
}));

vi.mock("../services/genre-search/browse-grid.js", () => ({ getCachedGenreCoverUrl }));

vi.mock("../services/genre-search/lastfm-api.js", () => ({ getGenreCoverUrl }));

vi.mock("../services/cc/jamendo/client.js", () => ({ getCcGenreCoverUrl, getCcGenres }));

const { default: genreArtworkRoutes } = await import("./genre-artwork.js");
const { default: ccGenreArtworkRoutes } = await import("./cc-genre-artwork.js");

/** The bytes a cached artwork answers with. */
const CACHED_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** The status code the artwork routes answer a key they refuse with. */
const BAD_REQUEST = 400;

/** The status code of an artwork served from the cache. */
const OK = 200;

/** The stable public error code a refused key reaches the client with. */
const INVALID_REQUEST_CODE = "MC-REQ-0001";

/** Every Fastify instance a test built, closed after each test. */
const apps: Array<ReturnType<typeof Fastify>> = [];

/** The bytes a freshly generated artwork answers with. */
const GENERATED_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/** The `Cache-Control` value of a stable artwork. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/** The `Cache-Control` value of a transient fallback artwork. */
const NO_STORE = "no-store";

/** The `Content-Type` every artwork answers with. */
const JPEG_CONTENT_TYPE = "image/jpeg";

/** A cover URL the browse grid captured. */
const GRID_COVER_URL = "https://lastfm.example/grid-cover.jpg";

/** A cover URL a fresh Last.fm lookup returns. */
const LASTFM_COVER_URL = "https://lastfm.example/fresh-cover.jpg";

/** A cover URL the Jamendo lookup returns. */
const JAMENDO_COVER_URL = "https://jamendo.example/cover.jpg";

beforeEach(() => {
  getCachedGenreCoverUrl.mockReturnValue(null);
  getGenreCoverUrl.mockResolvedValue(null);
  getCcGenreCoverUrl.mockResolvedValue(null);
  getCcGenres.mockResolvedValue([]);
});

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/**
 * Builds a Fastify instance with both genre artwork routes and the public
 * error handling the real server registers.
 *
 * @returns The ready instance, closed again after the test.
 */
async function buildApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  app.addSchema(createPublicErrorResponseSchema());
  registerApiErrorHandling(app);
  await app.register(genreArtworkRoutes);
  await app.register(ccGenreArtworkRoutes);
  return app;
}

describe.each([
  { family: "commercial", prefix: "/api/v1/genre-artwork", cachePrefix: "", buildPath: ENDPOINTS.v1.genreArtwork },
  {
    family: "Creative Commons",
    prefix: "/api/v1/cc/genre-artwork",
    cachePrefix: "cc:",
    buildPath: ENDPOINTS.v1.ccGenreArtwork,
  },
])("GET $prefix/:genreKey ($family)", ({ prefix, cachePrefix, buildPath }) => {
  it("refuses a key that decodes to a literal percent sign as a bad request", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: `${prefix}/100%25` });

    expect(response.statusCode).toBe(BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: INVALID_REQUEST_CODE, errorId: expect.any(String) });
    expect(getCachedArtwork).not.toHaveBeenCalled();
  });

  it("decodes the reserved characters the frontend proxy forwards still encoded", async () => {
    getCachedArtwork.mockResolvedValue({ jpeg: CACHED_JPEG, accentColor: "#000000" });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: `${prefix}/r%2526b` });

    expect(response.statusCode).toBe(OK);
    expect(getCachedArtwork).toHaveBeenCalledWith(`${cachePrefix}r&b`);
  });

  it.each([
    "drum & bass",
    "drum + bass",
    "c++",
  ])("reads %s from the address the frontend proxy calls", async (genreKey) => {
    getCachedArtwork.mockResolvedValue({ jpeg: CACHED_JPEG, accentColor: "#000000" });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: buildPath(genreKey) });

    expect(response.statusCode).toBe(OK);
    expect(getCachedArtwork).toHaveBeenCalledWith(`${cachePrefix}${genreKey}`);
  });

  it("keeps a public caller's encoded plus sign a literal plus sign", async () => {
    getCachedArtwork.mockResolvedValue({ jpeg: CACHED_JPEG, accentColor: "#000000" });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: `${prefix}/a%2Bb` });

    expect(response.statusCode).toBe(OK);
    expect(getCachedArtwork).toHaveBeenCalledWith(`${cachePrefix}a+b`);
  });

  it("serves a cached artwork as an immutable JPEG without generating one", async () => {
    getCachedArtwork.mockResolvedValue({ jpeg: CACHED_JPEG, accentColor: "#000000" });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: `${prefix}/rock` });

    expect(response.statusCode).toBe(OK);
    expect(response.headers["content-type"]).toBe(JPEG_CONTENT_TYPE);
    expect(response.headers["cache-control"]).toBe(IMMUTABLE);
    expect(response.rawPayload).toEqual(CACHED_JPEG);
    expect(ensureArtwork).not.toHaveBeenCalled();
  });

  it.each([
    { isFallback: false, cacheControl: IMMUTABLE },
    { isFallback: true, cacheControl: NO_STORE },
  ])("sends a generated artwork with fallback $isFallback as $cacheControl", async ({ isFallback, cacheControl }) => {
    getCachedArtwork.mockResolvedValue(null);
    ensureArtwork.mockResolvedValue({ jpeg: GENERATED_JPEG, accentColor: "#000000", isFallback });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: `${prefix}/rock` });

    expect(response.statusCode).toBe(OK);
    expect(response.headers["content-type"]).toBe(JPEG_CONTENT_TYPE);
    expect(response.headers["cache-control"]).toBe(cacheControl);
    expect(response.rawPayload).toEqual(GENERATED_JPEG);
  });
});

describe("GET /api/v1/genre-artwork/:genreKey on a cache miss", () => {
  beforeEach(() => {
    getCachedArtwork.mockResolvedValue(null);
    ensureArtwork.mockResolvedValue({ jpeg: GENERATED_JPEG, accentColor: "#000000", isFallback: false });
  });

  it("generates from the cover the browse grid captured, without a fresh Last.fm lookup", async () => {
    getCachedGenreCoverUrl.mockReturnValue(GRID_COVER_URL);
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/api/v1/genre-artwork/drum%20%26%20bass" });

    expect(getCachedGenreCoverUrl).toHaveBeenCalledWith("drum & bass");
    expect(getGenreCoverUrl).not.toHaveBeenCalled();
    expect(ensureArtwork).toHaveBeenCalledWith("drum & bass", GRID_COVER_URL, "Drum & Bass");
  });

  it("looks the cover up on Last.fm when the browse grid has none", async () => {
    getGenreCoverUrl.mockResolvedValue(LASTFM_COVER_URL);
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/api/v1/genre-artwork/rock" });

    expect(getGenreCoverUrl).toHaveBeenCalledWith("rock");
    expect(ensureArtwork).toHaveBeenCalledWith("rock", LASTFM_COVER_URL, "Rock");
    expect(getCcGenreCoverUrl).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/cc/genre-artwork/:genreKey on a cache miss", () => {
  beforeEach(() => {
    getCachedArtwork.mockResolvedValue(null);
    ensureArtwork.mockResolvedValue({ jpeg: GENERATED_JPEG, accentColor: "#000000", isFallback: false });
  });

  it("generates under the cc: key from the Jamendo cover and the curated station label", async () => {
    getCcGenres.mockResolvedValue([{ name: "drum & bass", displayName: "Drum'n'Bass" }]);
    getCcGenreCoverUrl.mockResolvedValue(JAMENDO_COVER_URL);
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/api/v1/cc/genre-artwork/drum%20%26%20bass" });

    expect(getCcGenreCoverUrl).toHaveBeenCalledWith("drum & bass");
    expect(ensureArtwork).toHaveBeenCalledWith("cc:drum & bass", JAMENDO_COVER_URL, "Drum'n'Bass");
    expect(getCachedGenreCoverUrl).not.toHaveBeenCalled();
    expect(getGenreCoverUrl).not.toHaveBeenCalled();
  });

  it("falls back to the title-cased key when no station carries the genre", async () => {
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/api/v1/cc/genre-artwork/rock" });

    expect(ensureArtwork).toHaveBeenCalledWith("cc:rock", null, "Rock");
  });
});

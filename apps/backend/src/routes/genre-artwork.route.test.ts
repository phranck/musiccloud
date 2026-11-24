import { ENDPOINTS } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

/** Stands in for the artwork table, so no test reaches a database. */
const getCachedArtwork = vi.fn();
/** Stands in for the generator, so no test renders an image. */
const ensureArtwork = vi.fn();

vi.mock("../services/genre-artwork/index.js", async () => ({
  ...(await import("../services/genre-artwork/genre-key.js")),
  ensureArtwork,
  getCachedArtwork,
}));

vi.mock("../services/genre-search/browse-grid.js", () => ({
  getCachedGenreCoverUrl: vi.fn().mockReturnValue(null),
}));

vi.mock("../services/genre-search/lastfm-api.js", () => ({
  getGenreCoverUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/cc/jamendo/client.js", () => ({
  getCcGenreCoverUrl: vi.fn().mockResolvedValue(null),
  getCcGenres: vi.fn().mockResolvedValue([]),
}));

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

afterEach(async () => {
  vi.clearAllMocks();
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
});

/**
 * @file A genre tile's artwork address survives Astro's path check and
 * reaches the backend as the key it was built from.
 *
 * Astro refuses a request path that still holds an escape after `decodeURI`
 * decoded something, so `drum%20%26%20bass` never reached the proxy route.
 * These tests run the installed Astro's own check on every address the site
 * builds, then the proxy route on the segment Astro hands it.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ENDPOINTS } from "@musiccloud/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Stands in for the backend call of the commercial proxy route. */
const fetchGenreArtworkMock = vi.fn();
/** Stands in for the backend call of the Creative Commons proxy route. */
const fetchCcGenreArtworkMock = vi.fn();

vi.mock("@/api/client", () => ({
  fetchGenreArtwork: fetchGenreArtworkMock,
  fetchCcGenreArtwork: fetchCcGenreArtworkMock,
}));

const { GET: commercialGet } = await import("@/pages/api/genre-artwork/[genreKey]");
const { GET: ccGet } = await import("@/pages/api/cc/genre-artwork/[genreKey]");

/** The shape of Astro's `core/util/pathname.js`, which ships without a package export. */
interface AstroPathnameModule {
  validateAndDecodePathname(pathname: string): string;
}

/** Where `validateAndDecodePathname` lives inside the installed `astro` package. */
const ASTRO_PATHNAME_MODULE = "dist/core/util/pathname.js";

/**
 * Astro's own path check, loaded from the installed package by file, because
 * its `exports` map does not list `dist/core/util/pathname.js`.
 */
const { validateAndDecodePathname } = (await import(
  pathToFileURL(
    path.join(path.dirname(createRequire(import.meta.url).resolve("astro/package.json")), ASTRO_PATHNAME_MODULE),
  ).href
)) as AstroPathnameModule;

/** The origin the proxy routes are called on in these tests. */
const SITE_ORIGIN = "https://musiccloud.test";

/** The visitor address the proxy routes forward. */
const VISITOR = "203.0.113.10";

/** The status code of an artwork the proxy streams through. */
const OK = 200;

/**
 * Genre keys whose addresses must survive: a space with `&`, a space with a
 * literal `+`, a literal `+` alone, a plain space and a lone reserved
 * character.
 */
const GENRE_KEYS = ["drum & bass", "drum + bass", "c++", "hip hop", "r&b"];

/** Both tile families, each with its address builder, its proxy route and its backend call. */
const FAMILIES = [
  {
    family: "commercial",
    buildPath: ENDPOINTS.frontend.genreArtwork,
    get: commercialGet,
    backend: fetchGenreArtworkMock,
  },
  {
    family: "Creative Commons",
    buildPath: ENDPOINTS.frontend.ccGenreArtwork,
    get: ccGet,
    backend: fetchCcGenreArtworkMock,
  },
];

afterEach(() => {
  fetchGenreArtworkMock.mockReset();
  fetchCcGenreArtworkMock.mockReset();
});

/**
 * The `genreKey` parameter Astro hands a proxy route for a request path:
 * the last segment of the path as `validateAndDecodePathname` returns it,
 * which is what Astro's route pattern matches against.
 *
 * @param requestPath - The path the browser requests.
 * @returns The route parameter.
 */
function routeParamFor(requestPath: string): string {
  const decodedPath = validateAndDecodePathname(requestPath);
  return decodedPath.slice(decodedPath.lastIndexOf("/") + 1);
}

describe.each(FAMILIES)("$family genre tile address", ({ buildPath, get, backend }) => {
  it.each(GENRE_KEYS)("passes Astro's path check for %s", (genreKey) => {
    expect(() => validateAndDecodePathname(buildPath(genreKey))).not.toThrow();
  });

  it.each(GENRE_KEYS)("reaches the backend as %s", async (genreKey) => {
    backend.mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff])));
    const requestPath = buildPath(genreKey);

    const response = await get({
      params: { genreKey: routeParamFor(requestPath) },
      url: new URL(`${SITE_ORIGIN}${requestPath}`),
      request: new Request(`${SITE_ORIGIN}${requestPath}`),
      clientAddress: VISITOR,
      // The proxy routes read only these fields of Astro's context.
    } as unknown as Parameters<typeof get>[0]);

    expect(response.status).toBe(OK);
    expect(backend).toHaveBeenCalledWith(genreKey, VISITOR);
  });
});

/**
 * @file Guards where the share response's absolute URLs come from.
 *
 * They used to be built on `X-Forwarded-Host`, on the stated assumption that
 * this route was reachable only through our own frontend. It is registered
 * unauthenticated and documented as public API, so the header was attacker
 * input, and a value carrying a path or a query broke the URL structure apart
 * rather than merely swapping the host.
 */
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const loadCcByShortId = vi.fn();

const repository = {
  loadByShortId: vi.fn(),
  loadAlbumByShortId: vi.fn().mockResolvedValue(null),
  loadArtistByShortId: vi.fn().mockResolvedValue(null),
  enrichAlbumVinylLayout: vi.fn(),
  readAlbumVinylLayout: vi.fn().mockResolvedValue(null),
  findAlbumByVinylLayoutIdentity: vi.fn().mockResolvedValue(null),
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(repository),
  getCcRepository: vi.fn().mockResolvedValue({ findCcShortId: vi.fn().mockResolvedValue(null) }),
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/server/cc-share-page.js", () => ({ loadCcByShortId }));

const { default: shareRoutes } = await import("./share.js");

const SHORT_ID = "origin-probe";

function trackShareResult() {
  return {
    trackId: "track-1",
    track: {
      title: "The Sermon",
      albumName: null,
      artworkUrl: "https://example.com/art.jpg",
      durationMs: 1_210_000,
      isrc: null,
      releaseDate: "1959-01-01",
      isExplicit: false,
      previewUrl: null,
    },
    artists: ["Jimmy Smith"],
    artistCredits: [],
    artistDisplay: "Jimmy Smith",
    shortId: SHORT_ID,
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

async function fetchShare(headers: Record<string, string> = {}) {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: `/api/v1/share/${SHORT_ID}`, headers });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe("share response origin", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_URL", "https://musiccloud.io");
    repository.loadByShortId.mockResolvedValue(trackShareResult());
    loadCcByShortId.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("builds the URLs from PUBLIC_URL", async () => {
    const body = await fetchShare();

    expect(body.shortUrl).toBe(`https://musiccloud.io/${SHORT_ID}`);
    expect(body.og.url).toBe(`https://musiccloud.io/${SHORT_ID}`);
  });

  it("ignores X-Forwarded-Host entirely", async () => {
    const body = await fetchShare({ "x-forwarded-host": "evil.example" });

    expect(body.shortUrl).toBe(`https://musiccloud.io/${SHORT_ID}`);
    expect(body.og.url).toBe(`https://musiccloud.io/${SHORT_ID}`);
  });

  it("cannot have its URL structure broken apart by a crafted header", async () => {
    // The header was interpolated raw, so a value carrying a path, a query and
    // a fragment moved the real short id behind the fragment marker and left
    // the victim on the attacker's page.
    const body = await fetchShare({ "x-forwarded-host": "evil.example/phish?x=y#" });

    expect(body.shortUrl).not.toContain("evil.example");
    expect(body.og.url).not.toContain("evil.example");
  });

  it("follows a reconfigured PUBLIC_URL", async () => {
    vi.stubEnv("PUBLIC_URL", "http://localhost:3001");

    const body = await fetchShare();

    expect(body.shortUrl).toBe(`http://localhost:3001/${SHORT_ID}`);
  });

  it("falls back to the production site when PUBLIC_URL is unusable", async () => {
    // A broken value must not produce a relative URL: the response schema
    // validates these as `format: uri` and serialization would fail.
    vi.stubEnv("PUBLIC_URL", "not-a-url");

    const body = await fetchShare();

    expect(body.shortUrl).toBe(`https://musiccloud.io/${SHORT_ID}`);
  });
});

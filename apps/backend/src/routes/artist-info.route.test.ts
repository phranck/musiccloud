import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const mocks = vi.hoisted(() => ({
  findArtistCache: vi.fn(),
  findArtistInfoAliasByShortId: vi.fn(),
  findArtistInfoEntity: vi.fn(),
  findShortIdByTrackUrl: vi.fn(),
  saveArtistCache: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(mocks),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(false),
}));

vi.mock("../services/artist-info.js", () => ({
  fetchArtistEvents: vi.fn(),
  fetchArtistProfile: vi.fn(),
  fetchArtistTopTracks: vi.fn(),
}));

const { default: artistInfoRoutes } = await import("./artist-info.js");

const APPS: Array<ReturnType<typeof Fastify>> = [];

function freshCache(artistName: string) {
  const now = Date.now();
  return {
    artistName,
    topTracks: [],
    profile: null,
    events: [],
    tracksUpdatedAt: now,
    profileUpdatedAt: now,
    eventsUpdatedAt: now,
  };
}

async function buildApp() {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { keywords: ["example"] } },
  });
  APPS.push(app);
  app.addSchema(createPublicErrorResponseSchema());
  for (const schema of OPENAPI_SCHEMAS) app.addSchema(schema);
  registerApiErrorHandling(app);
  await app.register(artistInfoRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findShortIdByTrackUrl.mockResolvedValue(null);
  mocks.findArtistInfoEntity.mockResolvedValue({ artistEntityId: "artist-entity-1", artistName: "Canonical Artist" });
  mocks.findArtistCache.mockResolvedValue(freshCache("Canonical Artist"));
});

afterEach(async () => {
  await Promise.all(APPS.splice(0).map((app) => app.close()));
});

describe("GET /api/v1/artist-info entity identity", () => {
  it("uses an entity's canonical name and cache namespace before a short-id alias", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?name=Ambiguous%20Artist&artistEntityId=artist-entity-1&shortId=share1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ artistName: "Canonical Artist" });
    expect(mocks.findArtistInfoEntity).toHaveBeenCalledWith("artist-entity-1");
    expect(mocks.findArtistInfoAliasByShortId).not.toHaveBeenCalled();
    expect(mocks.findArtistCache).toHaveBeenCalledWith({ kind: "entity", artistEntityId: "artist-entity-1" });
  });

  it("returns the canonical 404 envelope when an entity is unknown", async () => {
    mocks.findArtistInfoEntity.mockResolvedValueOnce(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=missing-artist-entity",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
    expect(mocks.findArtistInfoAliasByShortId).not.toHaveBeenCalled();
  });

  it("requires either a non-empty name or a non-empty artist entity id", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artist-info" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });
});

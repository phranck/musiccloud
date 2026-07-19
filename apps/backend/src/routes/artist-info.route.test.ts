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
  findShortIdsByTrackUrls: vi.fn(),
  fetchArtistEvents: vi.fn(),
  fetchArtistProfile: vi.fn(),
  fetchArtistTopTracks: vi.fn(),
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
  fetchArtistEvents: mocks.fetchArtistEvents,
  fetchArtistProfile: mocks.fetchArtistProfile,
  fetchArtistTopTracks: mocks.fetchArtistTopTracks,
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

const PROFILE = {
  imageUrl: null,
  genres: [],
  popularity: null,
  followers: null,
  bioSummary: "A profile",
  scrobbles: null,
  similarArtists: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
  mocks.findShortIdsByTrackUrls.mockResolvedValue(new Map());
  mocks.fetchArtistProfile.mockResolvedValue(PROFILE);
  mocks.fetchArtistTopTracks.mockResolvedValue([]);
  mocks.fetchArtistEvents.mockResolvedValue([]);
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

  it("rejects a malformed entity id with the canonical 400 envelope", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=not%20a%20valid%20id",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(mocks.findArtistInfoEntity).not.toHaveBeenCalled();
  });

  it("retains the legacy short-id alias path when no entity id is supplied", async () => {
    mocks.findArtistInfoAliasByShortId.mockResolvedValueOnce("Alias Artist");
    mocks.findArtistCache.mockResolvedValueOnce(freshCache("Alias Artist"));
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?name=Requested%20Artist&shortId=share1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ artistName: "Alias Artist" });
    expect(mocks.findArtistInfoAliasByShortId).toHaveBeenCalledWith("share1", "Requested Artist");
    expect(mocks.findArtistCache).toHaveBeenCalledWith({ kind: "name", artistName: "alias artist" });
  });

  it("requires either a non-empty name or a non-empty artist entity id", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artist-info" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });

  it("enriches primary and similar tracks through one batch permalink lookup", async () => {
    const primaryTrack = {
      title: "Primary",
      artists: ["Canonical Artist"],
      albumName: null,
      artworkUrl: null,
      durationMs: null,
      deezerUrl: "https://deezer.test/track/primary",
      shortId: null,
    };
    const similarTrack = {
      title: "Similar",
      artists: ["Related Artist"],
      albumName: null,
      artworkUrl: null,
      durationMs: null,
      deezerUrl: "https://deezer.test/track/similar",
      shortId: null,
    };
    mocks.findArtistCache
      .mockResolvedValueOnce({
        ...freshCache("Canonical Artist"),
        topTracks: [primaryTrack],
        profile: {
          imageUrl: null,
          genres: [],
          popularity: null,
          followers: null,
          bioSummary: null,
          scrobbles: null,
          similarArtists: ["Related Artist"],
        },
      })
      .mockResolvedValueOnce({ ...freshCache("Related Artist"), topTracks: [similarTrack] });
    mocks.findShortIdsByTrackUrls.mockResolvedValue(
      new Map([
        [primaryTrack.deezerUrl, "primary-short"],
        [similarTrack.deezerUrl, "similar-short"],
      ]),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=artist-entity-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      topTracks: [{ shortId: "primary-short" }],
      similarArtistTracks: [{ artistName: "Related Artist", track: { shortId: "similar-short" } }],
    });
    expect(mocks.findShortIdsByTrackUrls).toHaveBeenCalledTimes(1);
    expect(mocks.findShortIdsByTrackUrls).toHaveBeenCalledWith([primaryTrack.deezerUrl, similarTrack.deezerUrl]);
    expect(mocks.findShortIdByTrackUrl).not.toHaveBeenCalled();
  });

  it("returns a complete stale profile before its delayed background refresh settles", async () => {
    const pendingProfile = deferred<typeof PROFILE>();
    mocks.findArtistCache.mockResolvedValue({
      ...freshCache("Canonical Artist"),
      profile: PROFILE,
      profileUpdatedAt: Date.now() - 184 * 24 * 60 * 60 * 1000,
    });
    mocks.fetchArtistProfile.mockReturnValue(pendingProfile.promise);
    const app = await buildApp();

    const responsePromise = app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=artist-entity-1",
    });

    await vi.waitFor(() => expect(mocks.findShortIdsByTrackUrls).toHaveBeenCalled());
    const response = await responsePromise;
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ profile: PROFILE });
    expect(mocks.saveArtistCache).not.toHaveBeenCalled();

    pendingProfile.resolve(PROFILE);
    await vi.waitFor(() =>
      expect(mocks.saveArtistCache).toHaveBeenCalledWith(expect.objectContaining({ profile: PROFILE })),
    );
  });

  it("waits for a profile section that has no completed cache timestamp", async () => {
    const pendingProfile = deferred<typeof PROFILE>();
    mocks.findArtistCache.mockResolvedValue({ ...freshCache("Canonical Artist"), profile: null, profileUpdatedAt: 0 });
    mocks.fetchArtistProfile.mockReturnValue(pendingProfile.promise);
    const app = await buildApp();

    const responsePromise = app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=artist-entity-1",
    });
    await vi.waitFor(() => expect(mocks.fetchArtistProfile).toHaveBeenCalled());

    let settled = false;
    void responsePromise.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);

    pendingProfile.resolve(PROFILE);
    await expect(responsePromise).resolves.toMatchObject({ statusCode: 200 });
  });

  it("keeps refresh=profile synchronous and isolated from stale tracks and events", async () => {
    mocks.findArtistCache.mockResolvedValue({
      ...freshCache("Canonical Artist"),
      profile: PROFILE,
      tracksUpdatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      eventsUpdatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artist-info?artistEntityId=artist-entity-1&refresh=profile",
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.fetchArtistProfile).toHaveBeenCalledTimes(1);
    expect(mocks.fetchArtistTopTracks).not.toHaveBeenCalled();
    expect(mocks.fetchArtistEvents).not.toHaveBeenCalled();
  });
});

import { CORRELATION_ID_HEADER } from "@musiccloud/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const loadCcByShortId = vi.fn();

const repository = {
  loadByShortId: vi.fn(),
  loadAlbumByShortId: vi.fn(),
  loadArtistByShortId: vi.fn(),
  readVinylLayout: vi.fn(),
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

const SHORT_ID = "timing-probe";
const CORRELATION_ID = "f1d6d63f-7a6d-4b7f-9e3f-42c0d59a94de";

type LogRecord = Record<string, unknown>;

function trackShareResult() {
  return {
    trackId: "track-1",
    track: {
      title: "The Sermon",
      albumName: "The Sermon",
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

function buildApp(records: LogRecord[]) {
  const app = Fastify({
    logger: {
      level: "info",
      stream: { write: (message: string) => records.push(JSON.parse(message) as LogRecord) },
    },
    ajv: { customOptions: { keywords: ["example"] } },
  });
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

function timingRecord(records: LogRecord[]): LogRecord {
  const record = records.find((entry) => entry.operation === "share_request");
  expect(record, JSON.stringify(records)).toBeDefined();
  return record!;
}

describe("share request timing", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_URL", "https://musiccloud.io");
    repository.loadByShortId.mockResolvedValue(trackShareResult());
    repository.loadAlbumByShortId.mockResolvedValue(null);
    repository.loadArtistByShortId.mockResolvedValue(null);
    repository.readVinylLayout.mockResolvedValue(null);
    loadCcByShortId.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("logs every entity load, optional work, and total duration with the correlation id", async () => {
    const records: LogRecord[] = [];
    const app = buildApp(records);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/share/${SHORT_ID}`,
      headers: { [CORRELATION_ID_HEADER]: CORRELATION_ID },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["server-timing"]).toBeUndefined();
    expect(timingRecord(records)).toMatchObject({
      component: "Share",
      operation: "share_request",
      requestId: expect.any(String),
      correlationId: CORRELATION_ID,
      resultType: "track",
      statusCode: 200,
      route: "/api/v1/share/:shortId",
      shortId: SHORT_ID,
      entityLoadMs: {
        track: expect.any(Number),
        album: expect.any(Number),
        artist: expect.any(Number),
        cc: expect.any(Number),
      },
      optionalWorkMs: expect.any(Number),
      totalMs: expect.any(Number),
    });
    expect(timingRecord(records)).not.toHaveProperty("headers");
    expect(timingRecord(records)).not.toHaveProperty("requestBody");
  });

  it("logs total duration and status when a loader fails", async () => {
    repository.loadByShortId.mockRejectedValue(new Error("database down"));
    const records: LogRecord[] = [];
    const app = buildApp(records);

    const response = await app.inject({ method: "GET", url: `/api/v1/share/${SHORT_ID}` });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(timingRecord(records)).toMatchObject({
      resultType: "error",
      statusCode: 500,
      requestId: expect.any(String),
      entityLoadMs: {
        track: expect.any(Number),
        album: expect.any(Number),
        artist: expect.any(Number),
        cc: expect.any(Number),
      },
      totalMs: expect.any(Number),
    });
  });

  it("rejects a malformed correlation id without reaching the loaders", async () => {
    const records: LogRecord[] = [];
    const app = buildApp(records);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/share/${SHORT_ID}`,
      headers: { [CORRELATION_ID_HEADER]: "not valid" },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(repository.loadByShortId).not.toHaveBeenCalled();
    expect(response.headers["server-timing"]).toBeUndefined();
  });

  it("accepts a missing correlation id without inventing one", async () => {
    const records: LogRecord[] = [];
    const app = buildApp(records);

    const response = await app.inject({ method: "GET", url: `/api/v1/share/${SHORT_ID}` });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(timingRecord(records).correlationId).toBeUndefined();
  });
});

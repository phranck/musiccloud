import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

const getCcTrack = vi.fn();

vi.mock("../services/cc/jamendo/client.js", () => ({ getCcTrack }));

vi.mock("../lib/infra/logger.js", () => ({
  log: { debug: vi.fn() },
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(false),
}));

const { default: ccAudioRoutes } = await import("./cc-audio.js");

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  app.addSchema(createPublicErrorResponseSchema());
  registerApiErrorHandling(app);
  await app.register(ccAudioRoutes);
  return app;
}

function resolvedTrack(id: string) {
  return {
    jamendoId: id,
    title: "Test track",
    artistName: "Test artist",
    jamendoArtistId: "42",
    streamUrl: `https://cdn.example/${id}.mp3`,
    downloadAllowed: false,
  };
}

describe("GET /api/v1/cc/audio/:jamendoId", () => {
  it("rejects an invalid single-range header before resolving the track", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/cc/audio/1001",
      headers: { range: "bytes=-" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "MC-REQ-0001",
      errorId: expect.any(String),
    });
    expect(getCcTrack).not.toHaveBeenCalled();
  });

  it("forwards a complete audio representation with the documented headers", async () => {
    getCcTrack.mockResolvedValue(resolvedTrack("1002"));
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-length": "3", "content-type": "audio/mpeg" },
      }),
    );
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/cc/audio/1002" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-length"]).toBe("3");
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(response.rawPayload).toEqual(Buffer.from([1, 2, 3]));
  });

  it("forwards a satisfiable byte range as 206", async () => {
    getCcTrack.mockResolvedValue(resolvedTrack("1003"));
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([2, 3]), {
        status: 206,
        headers: {
          "content-length": "2",
          "content-range": "bytes 1-2/3",
          "content-type": "audio/mpeg",
        },
      }),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/cc/audio/1003",
      headers: { range: "bytes=1-2" },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 1-2/3");
    expect(fetch).toHaveBeenCalledWith("https://cdn.example/1003.mp3?format=mp32", {
      headers: { Range: "bytes=1-2" },
    });
  });

  it("maps every undocumented upstream status to the public 502 envelope", async () => {
    getCcTrack.mockResolvedValue(resolvedTrack("1004"));
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 201 }));
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/cc/audio/1004" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "MC-API-0001",
      errorId: expect.any(String),
      message: expect.stringContaining("audio stream is unavailable"),
    });
  });

  it("maps a successful upstream response without a body to 502", async () => {
    getCcTrack.mockResolvedValue(resolvedTrack("1005"));
    vi.mocked(fetch).mockResolvedValue({
      body: null,
      headers: new Headers(),
      status: 200,
    } as Response);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/cc/audio/1005" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "MC-API-0001",
      errorId: expect.any(String),
      message: expect.stringContaining("returned no body"),
    });
  });
});

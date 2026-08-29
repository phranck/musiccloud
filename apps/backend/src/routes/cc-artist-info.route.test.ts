import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";
import { JamendoUnavailableError } from "../services/cc/jamendo/client.js";

const buildCcTrackArtistInfo = vi.fn();

vi.mock("../services/cc/cc-share-response.js", () => ({ buildCcTrackArtistInfo }));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
  isInternalRequest: vi.fn().mockReturnValue(true),
}));

const { default: ccArtistInfoRoutes } = await import("./cc-artist-info.js");

const ARTIST_INFO = {
  artistName: "Tryad",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

async function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  // The route serialises through the published schemas, so the response shape
  // is exercised rather than assumed.
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" }, errorId: { type: "string" }, message: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) {
    app.addSchema(schema);
  }
  await app.register(ccArtistInfoRoutes);
  return app;
}

const query = "/api/v1/cc/artist-info?jamendoArtistId=104&artistName=Tryad";

describe("GET /api/v1/cc/artist-info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the artist column when Jamendo answers", async () => {
    buildCcTrackArtistInfo.mockResolvedValueOnce(ARTIST_INFO);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: query });

    expect(response.statusCode).toBe(200);
    expect(response.json().artistName).toBe("Tryad");

    await app.close();
  });

  /**
   * The column is enrichment on a page that already rendered. Reporting a third
   * party being unreachable as this service failing put a server error on
   * screen; a transient status lets the client retry and degrade quietly.
   */
  it("reports an unreachable Jamendo as a transient upstream failure", async () => {
    buildCcTrackArtistInfo.mockRejectedValueOnce(new JamendoUnavailableError("Jamendo could not be reached"));
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: query });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("MC-API-0001");
    expect(response.json().errorId).toEqual(expect.any(String));

    await app.close();
  });

  it("still reports a genuine fault as a server error", async () => {
    buildCcTrackArtistInfo.mockRejectedValueOnce(new Error("JAMENDO_CLIENT_ID is not set"));
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: query });

    expect(response.statusCode).toBe(500);

    await app.close();
  });

  it("rejects a request without the artist id", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/cc/artist-info?artistName=Tryad" });

    expect(response.statusCode).toBe(400);
    expect(buildCcTrackArtistInfo).not.toHaveBeenCalled();

    await app.close();
  });
});

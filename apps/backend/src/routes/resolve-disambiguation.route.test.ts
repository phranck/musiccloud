import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

vi.mock("../lib/env.js", () => ({
  requireEnvList: vi.fn().mockReturnValue(["http://localhost:3000"]),
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
}));

vi.mock("../services/resolver.js", () => ({
  expandShortLink: vi.fn((url: string) => url),
  resolveQuery: vi.fn(),
  resolveSelectedCandidate: vi.fn(),
  resolveTextSearchWithDisambiguation: vi.fn(),
}));

const { default: resolveRoutes } = await import("./resolve.js");
const { resolveTextSearchWithDisambiguation } = await import("../services/resolver.js");

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
  app.register(resolveRoutes);
  return app;
}

describe("POST /api/v1/resolve disambiguation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serializes an ambiguous result using the public candidate contract", async () => {
    vi.mocked(resolveTextSearchWithDisambiguation).mockResolvedValue({
      kind: "disambiguation",
      candidates: [
        {
          id: "spotify:2WfaOiMkCvy7F5fcp2zZ8L",
          title: "Take on Me",
          artists: ["a-ha"],
          albumName: "Hunting High and Low",
          artworkUrl: "https://example.com/take-on-me.jpg",
          durationMs: 225280,
          confidence: 0.75,
        },
      ],
    });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: "take on me a-ha" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "disambiguation",
      candidates: [
        {
          id: "spotify:2WfaOiMkCvy7F5fcp2zZ8L",
          title: "Take on Me",
          artists: ["a-ha"],
          albumName: "Hunting High and Low",
          artworkUrl: "https://example.com/take-on-me.jpg",
        },
      ],
    });

    await app.close();
  });

  it("rejects a body that supplies both a query and a selected candidate", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/resolve",
      headers: { origin: "http://localhost:3000" },
      payload: { query: "take on me a-ha", selectedCandidate: "spotify:2WfaOiMkCvy7F5fcp2zZ8L" },
    });

    expect(response.statusCode).toBe(400);
    expect(resolveTextSearchWithDisambiguation).not.toHaveBeenCalled();

    await app.close();
  });
});

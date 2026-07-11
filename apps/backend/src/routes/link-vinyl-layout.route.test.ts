import type { VinylLayout } from "@musiccloud/shared";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const loadByTrackId = vi.fn();
const findAlbumByVinylLayoutIdentity = vi.fn();
const readAlbumVinylLayout = vi.fn();

vi.mock("../db/index.js", () => ({
  getRepository: async () => ({ loadByTrackId, findAlbumByVinylLayoutIdentity, readAlbumVinylLayout }),
}));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
}));

const { default: linkRoutes } = await import("./link.js");

const vinylLayout: VinylLayout = {
  discogsReleaseId: "15815903",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
};

function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" }, message: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) app.addSchema(schema);
  app.register(linkRoutes);
  return app;
}

describe("GET /api/v1/link/:id vinyl layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadByTrackId.mockResolvedValue({
      track: {
        title: "The Sermon!",
        albumName: "The Sermon!",
        artworkUrl: "https://example.com/the-sermon.jpg",
      },
      artists: ["Jimmy Smith"],
      links: [],
    });
    findAlbumByVinylLayoutIdentity.mockResolvedValue({ albumId: "layout-owner" });
    readAlbumVinylLayout.mockResolvedValue(vinylLayout);
  });

  it("returns the cached album layout through the real Track response schema", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/link/track-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json().track.vinylLayout).toEqual(vinylLayout);
    expect(findAlbumByVinylLayoutIdentity).toHaveBeenCalledWith("jimmy smith::the sermon");

    await app.close();
  });
});

import { type AdminArtistListItem, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminRepository } from "../db/index.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import adminDataRoutes from "./admin-data.js";

const mockAdminRepository = {
  listArtists: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => mockAdminRepository),
  getApiAccessRepository: vi.fn(),
}));

const ARTIST: AdminArtistListItem = {
  id: "artist-1",
  artistEntityId: "artist-1",
  name: "Slowdive",
  imageUrl: null,
  genres: ["dream pop"],
  sourceService: "deezer",
  linkCount: 2,
  createdAt: 1_700_000_000_000,
  shortId: "slowdive",
  profileCache: {
    state: "failed",
    profileUpdatedAt: "2026-01-01T00:00:00.000Z",
    ageMs: 1000,
    providers: ["spotify", "lastfm"],
    latestManualRefresh: {
      trigger: "manual",
      occurredAt: "2026-07-19T20:00:00.000Z",
      completedAt: "2026-07-19T20:00:05.000Z",
      outcome: "failed",
      errorCode: "MC-API-0001",
      errorId: "error-38",
    },
  },
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockAdminRepository.listArtists.mockResolvedValue({ items: [ARTIST], total: 1, page: 1, limit: 20 });
  app = Fastify();
  registerApiErrorHandling(app);
  await app.register(adminDataRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/admin/artists", () => {
  it("returns the shared artist profile-cache contract unchanged", async () => {
    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artists.list });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [ARTIST], total: 1, page: 1, limit: 20 });
    expect(getAdminRepository).toHaveBeenCalledTimes(1);
    expect(mockAdminRepository.listArtists).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
      sortBy: undefined,
      sortDir: undefined,
    });
  });

  it("preserves canonical database errors when the projection fails", async () => {
    mockAdminRepository.listArtists.mockRejectedValueOnce(
      Object.assign(new Error("database unavailable"), {
        code: "08006",
      }),
    );

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artists.list });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "MC-DB-0003",
      errorId: expect.any(String),
      message: expect.any(String),
    });
  });
});

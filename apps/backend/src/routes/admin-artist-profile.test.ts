import { type ArtistProfileRefreshResponse, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../db/admin-repository.js";
import { getAdminCaller } from "../lib/admin-caller.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { AdminArtistProfileRefreshError, refreshAdminArtistProfile } from "../services/admin-artist-profile-refresh.js";
import adminArtistProfileRoutes from "./admin-artist-profile.js";

vi.mock("../lib/admin-caller.js", () => ({
  getAdminCaller: vi.fn(),
}));

vi.mock("../services/admin-artist-profile-refresh.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/admin-artist-profile-refresh.js")>();
  return { ...original, refreshAdminArtistProfile: vi.fn() };
});

const RESPONSE: ArtistProfileRefreshResponse = {
  artistEntityId: "artist-1",
  profileCache: {
    state: "fresh",
    profileUpdatedAt: "2026-07-19T20:00:00.000Z",
    ageMs: 5000,
    providers: ["spotify"],
    latestManualRefresh: {
      trigger: "manual",
      occurredAt: "2026-07-19T20:00:00.000Z",
      completedAt: "2026-07-19T20:00:05.000Z",
      outcome: "succeeded",
      errorCode: null,
      errorId: null,
    },
  },
  manualRefresh: {
    trigger: "manual",
    occurredAt: "2026-07-19T20:00:00.000Z",
    completedAt: "2026-07-19T20:00:05.000Z",
    outcome: "succeeded",
    errorCode: null,
    errorId: null,
  },
};

function admin(): AdminUser {
  return {
    id: "admin-1",
    username: "dashboard-admin",
    passwordHash: "hash",
    email: "admin@example.com",
    role: "admin",
    firstName: null,
    lastName: null,
    avatarUrl: null,
    sessionTimeoutMinutes: 30,
    createdAt: 1_700_000_000_000,
    lastLoginAt: null,
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getAdminCaller).mockResolvedValue(admin());
  vi.mocked(refreshAdminArtistProfile).mockResolvedValue(RESPONSE);
  app = Fastify();
  registerApiErrorHandling(app);
  await app.register(adminArtistProfileRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/admin/artists/:artistEntityId/profile/refresh", () => {
  it("refreshes one profile for the authenticated DB admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.artists.refreshProfile("artist-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(RESPONSE);
    expect(refreshAdminArtistProfile).toHaveBeenCalledWith({
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      requestId: expect.any(String),
    });
  });

  it("rejects a missing or deleted DB admin with a canonical error", async () => {
    vi.mocked(getAdminCaller).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.artists.refreshProfile("artist-1"),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "MC-AUTH-0002", errorId: expect.any(String) });
    expect(refreshAdminArtistProfile).not.toHaveBeenCalled();
  });

  it("preserves the service errorId at the public API boundary", async () => {
    const failureResponse = createApiErrorResponse("MC-API-0001", { errorId: "error-38" });
    vi.mocked(refreshAdminArtistProfile).mockRejectedValueOnce(
      new AdminArtistProfileRefreshError(502, failureResponse, "Upstream profile unavailable"),
    );

    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.artists.refreshProfile("artist-1"),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: "MC-API-0001", errorId: "error-38" });
  });

  it("rejects malformed entity identifiers before invoking the service", async () => {
    const response = await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.artists.refreshProfile("not an id"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(refreshAdminArtistProfile).not.toHaveBeenCalled();
  });
});

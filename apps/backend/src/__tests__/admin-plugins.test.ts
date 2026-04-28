import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB layer so tests don't need a real Postgres. In-memory Map
// stands in for the service_plugins table.
const pluginStore = new Map<string, boolean>();
vi.mock("../db/plugin-repository.js", () => ({
  readPluginStatesFromDb: vi.fn(async () => {
    return Array.from(pluginStore.entries()).map(([id, enabled]) => ({
      id,
      enabled,
      updatedAt: new Date(),
    }));
  }),
  upsertPluginState: vi.fn(async (id: string, enabled: boolean) => {
    pluginStore.set(id, enabled);
  }),
}));

// runMigrations is called only from start(), not buildApp() — no need to mock.
// admin-users route calls admin-repository.ts which in turn imports a pg pool;
// nothing hits it in our test paths, so we leave it alone.

import { buildApp } from "../server.js";
import { invalidateEnabledCache } from "../services/plugins/registry.js";

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-admin-plugins";
  app = await buildApp();
  adminToken = app.jwt.sign({ sub: "test-admin", role: "admin" });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  pluginStore.clear();
  invalidateEnabledCache();
});

describe("GET /api/admin/plugins", () => {
  it("rejects without auth (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/plugins" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects non-admin tokens (403)", async () => {
    const token = app.jwt.sign({ sub: "user", role: "user" });
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns one entry per installed plugin (21 total)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(21);
  });

  it("each entry exposes the documented shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = res.json() as Array<Record<string, unknown>>;
    const spotify = body.find((p) => p.id === "spotify");
    expect(spotify).toBeDefined();
    expect(spotify).toMatchObject({
      id: "spotify",
      displayName: "Spotify",
      defaultEnabled: true,
      enabled: true,
      hasAlbumSupport: true,
      hasArtistSupport: true,
    });
    expect(Array.isArray(spotify?.requiredEnv)).toBe(true);
    expect((spotify?.requiredEnv as string[]).includes("SPOTIFY_CLIENT_ID")).toBe(true);
    expect(spotify?.capabilities).toMatchObject({
      supportsIsrc: true,
    });
  });

  it("reflects missingEnv when credentials are absent", async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = res.json() as Array<{ id: string; missingEnv: string[] }>;
    const spotify = body.find((p) => p.id === "spotify");
    expect(spotify?.missingEnv).toEqual(expect.arrayContaining(["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]));
  });
});

describe("PATCH /api/admin/plugins/:id", () => {
  it("rejects without auth (401)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/plugins/spotify",
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid plugin id (400)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/plugins/nonexistent",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "INVALID_ID" });
  });

  it("rejects a non-boolean enabled (400)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/plugins/spotify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: "yes" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "INVALID_BODY" });
  });

  it("toggles a plugin off and the next GET reflects it", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/admin/plugins/spotify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ id: "spotify", enabled: false });

    const get = await app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = get.json() as Array<{ id: string; enabled: boolean }>;
    expect(body.find((p) => p.id === "spotify")?.enabled).toBe(false);
  });
});

describe("GET /api/v1/services/active", () => {
  beforeEach(() => {
    // Guarantee credentials present so isAvailable() returns true for
    // credential-gated adapters that get asserted below.
    process.env.SPOTIFY_CLIENT_ID = "test";
    process.env.SPOTIFY_CLIENT_SECRET = "test";
  });

  it("is publicly accessible (no auth required)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/services/active" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("returns entries with id, displayName, color", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/services/active" });
    const body = res.json() as Array<{ id: string; displayName: string; color: string }>;
    expect(body.length).toBeGreaterThan(0);
    for (const entry of body) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.displayName).toBe("string");
      expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("omits a plugin after it has been toggled off", async () => {
    // Toggle spotify off via admin API
    await app.inject({
      method: "PATCH",
      url: "/api/admin/plugins/spotify",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: false },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/services/active" });
    const body = res.json() as Array<{ id: string }>;
    expect(body.find((s) => s.id === "spotify")).toBeUndefined();
  });
});

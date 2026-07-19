import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlStateRecord, TrackRepository } from "../db/repository.js";

const crawlState = new Map<string, CrawlStateRecord>();
const updateCrawlStateMock = vi.fn();
const listCrawlRunsMock = vi.fn();

function cloneRow(row: CrawlStateRecord): CrawlStateRecord {
  return { ...row, config: { ...row.config } };
}

const mockRepo = {
  seedCrawlState: vi.fn(
    async (seed: {
      source: string;
      displayName: string;
      defaultEnabled: boolean;
      defaultIntervalMinutes: number;
      defaultConfig: Record<string, unknown>;
    }) => {
      if (crawlState.has(seed.source)) return;
      crawlState.set(seed.source, {
        source: seed.source,
        displayName: seed.displayName,
        enabled: seed.defaultEnabled,
        intervalMinutes: seed.defaultIntervalMinutes,
        nextRunAt: new Date("2026-07-19T00:00:00.000Z"),
        lastRunAt: null,
        cursor: null,
        config: { ...seed.defaultConfig },
        runningSince: null,
        errorCount: 0,
        lastError: null,
        consecutiveErrors: 0,
      });
    },
  ),
  listCrawlState: vi.fn(async () => [...crawlState.values()].map(cloneRow)),
  findCrawlState: vi.fn(async (source: string) => {
    const row = crawlState.get(source);
    return row ? cloneRow(row) : null;
  }),
  updateCrawlState: updateCrawlStateMock,
  listCrawlRuns: listCrawlRunsMock,
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => mockRepo as unknown as TrackRepository),
}));

import { buildApp } from "../server.js";

const originalApiKey = process.env.LASTFM_API_KEY;
let app: FastifyInstance;
let adminToken: string;

async function listSources(): Promise<void> {
  await app.inject({
    method: "GET",
    url: "/api/admin/crawler/sources",
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-admin-crawler";
  app = await buildApp();
  adminToken = app.jwt.sign({ sub: "test-admin", role: "admin" });
});

afterAll(async () => {
  await app.close();
  if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = originalApiKey;
});

beforeEach(() => {
  crawlState.clear();
  delete process.env.LASTFM_API_KEY;
  vi.clearAllMocks();
  updateCrawlStateMock.mockImplementation(async (source: string, patch: Record<string, unknown>) => {
    const current = crawlState.get(source);
    if (!current) return null;
    const updated: CrawlStateRecord = {
      ...current,
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled as boolean }),
      ...(patch.intervalMinutes === undefined ? {} : { intervalMinutes: patch.intervalMinutes as number }),
      ...(patch.config === undefined ? {} : { config: patch.config as Record<string, unknown> }),
      ...(patch.cursor === undefined ? {} : { cursor: patch.cursor }),
      ...(patch.nextRunAt === undefined ? {} : { nextRunAt: patch.nextRunAt as Date }),
      ...(patch.runningSince === undefined ? {} : { runningSince: patch.runningSince as null }),
    };
    crawlState.set(source, updated);
    return cloneRow(updated);
  });
  listCrawlRunsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
});

describe("GET /api/admin/crawler/sources", () => {
  it("seeds and returns the disabled Last.fm Tag Tops source with exact defaults", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/crawler/sources",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "lastfm-tags",
          displayName: "Last.fm Tag Tops",
          enabled: false,
          intervalMinutes: 360,
          config: { tags: [], limit: 50 },
        }),
      ]),
    );
  });
});

describe("PATCH /api/admin/crawler/sources/:id", () => {
  it("rejects malformed Last.fm configuration with a canonical safe error before persisting", async () => {
    await listSources();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/crawler/sources/lastfm-tags",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { config: { tags: ["rock", " ROCK "], limit: 50 } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(response.body).not.toMatch(/lastfm|api.?key/i);
    expect(updateCrawlStateMock).not.toHaveBeenCalled();
  });

  it("rejects enabling the source until its configuration and runtime prerequisites are ready", async () => {
    await listSources();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/crawler/sources/lastfm-tags",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(response.body).not.toMatch(/lastfm|api.?key/i);
    expect(updateCrawlStateMock).not.toHaveBeenCalled();
  });

  it("normalizes a valid configuration before enabling the source", async () => {
    await listSources();
    process.env.LASTFM_API_KEY = "test-key";

    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/crawler/sources/lastfm-tags",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { enabled: true, config: { tags: [" Rock "], limit: 12 } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: "lastfm-tags",
      enabled: true,
      config: { tags: ["rock"], limit: 12 },
    });
    expect(updateCrawlStateMock).toHaveBeenCalledWith(
      "lastfm-tags",
      expect.objectContaining({ enabled: true, config: { tags: ["rock"], limit: 12 } }),
    );
  });
});

describe("POST /api/admin/crawler/sources/:id/run-now", () => {
  it("rejects a Last.fm source that cannot execute before changing its schedule", async () => {
    await listSources();
    const current = crawlState.get("lastfm-tags");
    if (!current) throw new Error("Last.fm source was not seeded");
    crawlState.set("lastfm-tags", { ...current, config: { tags: ["rock"], limit: 50 } });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/crawler/sources/lastfm-tags/run-now",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(response.body).not.toMatch(/lastfm|api.?key/i);
    expect(updateCrawlStateMock).not.toHaveBeenCalled();
  });

  it("schedules an executable Last.fm source immediately", async () => {
    await listSources();
    process.env.LASTFM_API_KEY = "test-key";
    const current = crawlState.get("lastfm-tags");
    if (!current) throw new Error("Last.fm source was not seeded");
    crawlState.set("lastfm-tags", { ...current, config: { tags: ["rock"], limit: 50 } });

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/crawler/sources/lastfm-tags/run-now",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: "lastfm-tags", config: { tags: ["rock"], limit: 50 } });
    expect(updateCrawlStateMock).toHaveBeenCalledWith("lastfm-tags", {
      nextRunAt: expect.any(Date),
    });
  });
});

describe("GET /api/admin/crawler/runs", () => {
  it("returns the existing paginated run-history contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/crawler/runs?source=lastfm-tags&page=1&limit=50",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, page: 1, limit: 50 });
    expect(listCrawlRunsMock).toHaveBeenCalledWith({ source: "lastfm-tags", page: 1, limit: 50 });
  });
});

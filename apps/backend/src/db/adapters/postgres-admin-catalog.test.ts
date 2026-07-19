import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { listArtists } from "./postgres-admin-catalog.js";

const FRESH_AT = new Date();
const STALE_AT = new Date("2000-01-01T00:00:00.000Z");

function artistRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    artist_entity_id: id,
    name: `Artist ${id}`,
    image_url: null,
    genres: "[]",
    source_service: "deezer",
    source_url: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: FRESH_AT,
    short_id: `short-${id}`,
    link_count: "1",
    profile_cache_present: true,
    profile_updated_at: FRESH_AT,
    profile_providers: ["spotify"],
    refresh_trigger: null,
    refresh_occurred_at: null,
    refresh_completed_at: null,
    refresh_outcome: null,
    refresh_error_code: null,
    refresh_error_id: null,
    ...overrides,
  };
}

describe("listArtists profile cache projection", () => {
  it("classifies all observable states in the existing side-effect-free page query", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          artistRow("fresh"),
          artistRow("stale", { profile_updated_at: STALE_AT, profile_providers: ["lastfm"] }),
          artistRow("missing", {
            profile_cache_present: false,
            profile_updated_at: null,
            profile_providers: [],
          }),
          artistRow("refreshing", {
            refresh_trigger: "manual",
            refresh_occurred_at: FRESH_AT,
            refresh_outcome: "refreshing",
          }),
          artistRow("failed", {
            profile_updated_at: STALE_AT,
            refresh_trigger: "manual",
            refresh_occurred_at: FRESH_AT,
            refresh_completed_at: FRESH_AT,
            refresh_outcome: "failed",
            refresh_error_code: "MC-API-0001",
            refresh_error_id: "error-38",
          }),
        ],
      });
    const pool = { query, connect: vi.fn() } as unknown as Pool;

    const result = await listArtists(pool, { page: 1, limit: 20 });

    expect(result.items.map((artist) => artist.profileCache.state)).toEqual([
      "fresh",
      "stale",
      "missing",
      "refreshing",
      "failed",
    ]);
    expect(result.items[0]).toMatchObject({
      id: "fresh",
      artistEntityId: "fresh",
      profileCache: { providers: ["spotify"], ageMs: expect.any(Number) },
    });
    expect(result.items[0]?.profileCache.ageMs).toBeGreaterThanOrEqual(0);
    expect(result.items[4]?.profileCache.latestManualRefresh).toEqual({
      trigger: "manual",
      occurredAt: FRESH_AT.toISOString(),
      completedAt: FRESH_AT.toISOString(),
      outcome: "failed",
      errorCode: "MC-API-0001",
      errorId: "error-38",
    });

    expect(query).toHaveBeenCalledTimes(2);
    const pageSql = String(query.mock.calls[1]?.[0]);
    expect(pageSql).toContain("LEFT JOIN artist_cache");
    expect(pageSql).toContain("LEFT JOIN LATERAL");
    expect(pageSql).toContain("artist_profile_refresh_events");
    expect(pageSql).toContain("ORDER BY occurred_at DESC");
    expect(pageSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

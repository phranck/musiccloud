import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  beginArtistProfileRefresh,
  completeArtistProfileRefresh,
  failArtistProfileRefresh,
} from "./postgres-artist-profile-refresh.js";

const OCCURRED_AT = new Date("2026-07-19T20:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-19T20:00:05.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "refresh-event-1",
    actor_admin_id: "admin-1",
    artist_entity_id: "artist-1",
    trigger: "manual",
    occurred_at: OCCURRED_AT,
    completed_at: null,
    outcome: "refreshing",
    error_code: null,
    error_id: null,
    cause: null,
    ...overrides,
  };
}

describe("artist profile refresh audit repository", () => {
  it("begins exactly one refreshing event for an accepted attempt", async () => {
    const query = vi.fn().mockImplementation(async (_sql, params) => ({
      rows: [row({ id: params[0] })],
    }));
    const pool = { query } as unknown as Pool;

    const event = await beginArtistProfileRefresh(pool, {
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      occurredAt: OCCURRED_AT,
    });

    expect(event).toMatchObject({
      actorAdminId: "admin-1",
      artistEntityId: "artist-1",
      outcome: "refreshing",
      occurredAt: OCCURRED_AT,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO artist_profile_refresh_events");
    expect(query.mock.calls[0]?.[1]).toEqual([event.id, "admin-1", "artist-1", OCCURRED_AT]);
  });

  it("completes the same event as succeeded", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [row({ completed_at: COMPLETED_AT, outcome: "succeeded" })],
    });
    const pool = { query } as unknown as Pool;

    await expect(completeArtistProfileRefresh(pool, "refresh-event-1", COMPLETED_AT)).resolves.toMatchObject({
      id: "refresh-event-1",
      completedAt: COMPLETED_AT,
      outcome: "succeeded",
    });
    expect(query.mock.calls[0]?.[0]).toContain("WHERE id = $1 AND outcome = 'refreshing'");
    expect(query.mock.calls[0]?.[1]).toEqual(["refresh-event-1", COMPLETED_AT]);
  });

  it("stores only supplied safe failure metadata on the same event", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        row({
          completed_at: COMPLETED_AT,
          outcome: "failed",
          error_code: "MC-API-0001",
          error_id: "error-38",
          cause: "Upstream artist profile unavailable",
        }),
      ],
    });
    const pool = { query } as unknown as Pool;

    await expect(
      failArtistProfileRefresh(pool, "refresh-event-1", {
        completedAt: COMPLETED_AT,
        errorCode: "MC-API-0001",
        errorId: "error-38",
        cause: "Upstream artist profile unavailable",
      }),
    ).resolves.toMatchObject({
      id: "refresh-event-1",
      outcome: "failed",
      errorCode: "MC-API-0001",
      errorId: "error-38",
      cause: "Upstream artist profile unavailable",
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      "refresh-event-1",
      COMPLETED_AT,
      "MC-API-0001",
      "error-38",
      "Upstream artist profile unavailable",
    ]);
  });

  it("rejects a second terminal outcome for the same event", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;

    await expect(completeArtistProfileRefresh(pool, "refresh-event-1", COMPLETED_AT)).rejects.toThrow(
      "Artist profile refresh event is not refreshing",
    );
  });
});

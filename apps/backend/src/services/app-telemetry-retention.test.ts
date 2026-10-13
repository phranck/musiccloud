import { describe, expect, it, vi } from "vitest";

import { sweepAppTelemetryRetention } from "./app-telemetry-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("sweepAppTelemetryRetention", () => {
  it("removes telemetry events received more than ninety days ago", async () => {
    const now = Date.parse("2026-10-13T03:37:00.000Z");
    const repo = { deleteAppTelemetryEventsBefore: vi.fn().mockResolvedValue(7) };

    const removed = await sweepAppTelemetryRetention(repo, now);

    expect(repo.deleteAppTelemetryEventsBefore).toHaveBeenCalledWith(now - 90 * DAY_MS);
    expect(removed).toBe(7);
  });
});

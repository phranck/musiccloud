import { describe, expect, it, vi } from "vitest";

import { AUDIT_RETENTION_DAYS, sweepApiAccessRetention, USAGE_RETENTION_DAYS } from "./api-access-retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("sweepApiAccessRetention", () => {
  it("removes usage rows past ninety days and audit rows past a year", async () => {
    const now = Date.parse("2026-10-12T03:17:00.000Z");
    const repo = {
      deleteApiUsageEventsBefore: vi.fn().mockResolvedValue(12),
      deleteApiAccessAuditEventsBefore: vi.fn().mockResolvedValue(3),
    };

    const removed = await sweepApiAccessRetention(repo, now);

    expect(USAGE_RETENTION_DAYS).toBe(90);
    expect(AUDIT_RETENTION_DAYS).toBe(365);
    expect(repo.deleteApiUsageEventsBefore).toHaveBeenCalledWith(now - 90 * DAY_MS);
    expect(repo.deleteApiAccessAuditEventsBefore).toHaveBeenCalledWith(now - 365 * DAY_MS);
    expect(removed).toEqual({ usageRows: 12, auditRows: 3 });
  });
});

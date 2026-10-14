import { describe, expect, it } from "vitest";

import { RETENTION_DAY_MS } from "./api-access-retention.js";
import { APP_ATTEST_KEY_RETENTION_DAYS, sweepAppAttestKeyRetention } from "./app-attest-retention.js";

describe("sweepAppAttestKeyRetention", () => {
  it("removes keys unused for longer than the retention period", async () => {
    const now = Date.UTC(2026, 9, 14);
    let cutoff: Date | undefined;
    const removed = await sweepAppAttestKeyRetention(async (date) => {
      cutoff = date;
      return 3;
    }, now);

    expect(removed).toBe(3);
    expect(cutoff?.getTime()).toBe(now - APP_ATTEST_KEY_RETENTION_DAYS * RETENTION_DAY_MS);
  });
});

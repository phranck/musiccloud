import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleWithinDeadline } from "./fan-out-deadline.js";

describe("settleWithinDeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns as soon as every task has settled", async () => {
    const fanOut = await settleWithinDeadline([Promise.resolve("a"), Promise.reject(new Error("b"))], 2_000);

    expect(fanOut.early[0]).toEqual({ status: "fulfilled", value: "a" });
    expect(fanOut.early[1]).toMatchObject({ status: "rejected" });
  });

  it("reports a task still running at the deadline as undefined and keeps it running", async () => {
    let finishSlow!: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      finishSlow = resolve;
    });

    const pending = settleWithinDeadline([Promise.resolve("fast"), slow], 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const fanOut = await pending;

    expect(fanOut.early).toEqual([{ status: "fulfilled", value: "fast" }, undefined]);

    finishSlow("slow");
    await expect(fanOut.all).resolves.toEqual([
      { status: "fulfilled", value: "fast" },
      { status: "fulfilled", value: "slow" },
    ]);
  });

  it("never rejects its promise of all results", async () => {
    let failLate!: (reason: Error) => void;
    const late = new Promise<string>((_, reject) => {
      failLate = reject;
    });

    const pending = settleWithinDeadline([late], 100);
    await vi.advanceTimersByTimeAsync(100);
    const fanOut = await pending;
    failLate(new Error("late failure"));

    await expect(fanOut.all).resolves.toEqual([{ status: "rejected", reason: new Error("late failure") }]);
  });
});

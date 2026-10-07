import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter, createSingleFlight, mapWithConcurrency } from "../concurrency.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("never runs more calls at once than the cap and keeps the input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10, 15, 2], 3, async (delayMs, index) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      inFlight--;
      return `${index}:${delayMs}`;
    });

    expect(peak).toBe(3);
    expect(results).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10", "5:15", "6:2"]);
  });

  it("rejects with the error of a failing call", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error("upstream failed");
        return value;
      }),
    ).rejects.toThrow("upstream failed");
  });
});

describe("createConcurrencyLimiter", () => {
  it("frees the slot of a task that throws", async () => {
    const limit = createConcurrencyLimiter(1);

    await expect(limit(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(async () => "next")).resolves.toBe("next");
  });

  it("holds every caller to one shared cap and starts waiters in arrival order", async () => {
    const limit = createConcurrencyLimiter(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];

    const runs = gates.map((gate, index) =>
      limit(async () => {
        started.push(index);
        await gate.promise;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[1].resolve();
    await runs[1];
    expect(started).toEqual([0, 1, 2]);

    gates[0].resolve();
    gates[2].resolve();
    await Promise.all(runs);
  });

  it("refuses a cap below one", () => {
    expect(() => createConcurrencyLimiter(0)).toThrow(RangeError);
  });
});

describe("createSingleFlight", () => {
  it("runs one task for concurrent callers of the same key", async () => {
    const flight = createSingleFlight<string, number>();
    const gate = deferred();
    let runs = 0;
    const task = async () => {
      runs++;
      await gate.promise;
      return 42;
    };

    const first = flight("key", task);
    const second = flight("key", task);
    gate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    expect(runs).toBe(1);
  });

  it("keeps different keys apart and starts afresh once a task has settled", async () => {
    const flight = createSingleFlight<string, string>();
    let runs = 0;
    const task = async () => `run ${++runs}`;

    await expect(Promise.all([flight("a", task), flight("b", task)])).resolves.toEqual(["run 1", "run 2"]);
    await expect(flight("a", task)).resolves.toBe("run 3");
  });

  it("hands a rejection to every caller and forgets the key", async () => {
    const flight = createSingleFlight<string, string>();
    const failing = () => Promise.reject(new Error("upstream down"));

    const results = await Promise.allSettled([flight("key", failing), flight("key", failing)]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    await expect(flight("key", async () => "recovered")).resolves.toBe("recovered");
  });
});

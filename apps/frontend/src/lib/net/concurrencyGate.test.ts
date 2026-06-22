import { describe, expect, it } from "vitest";
import { createConcurrencyGate } from "@/lib/net/concurrencyGate";

describe("createConcurrencyGate", () => {
  it("resolves acquires immediately up to the limit", async () => {
    const gate = createConcurrencyGate(2);
    let resolved = 0;
    await Promise.all([
      gate.acquire().then(() => {
        resolved++;
      }),
      gate.acquire().then(() => {
        resolved++;
      }),
    ]);
    expect(resolved).toBe(2);
  });

  it("queues acquires beyond the limit until a slot is released", async () => {
    const gate = createConcurrencyGate(1);
    await gate.acquire(); // holds the only slot

    let thirdResolved = false;
    const pending = gate.acquire().then(() => {
      thirdResolved = true;
    });

    // The queued acquire must not resolve while the slot is held.
    await Promise.resolve();
    expect(thirdResolved).toBe(false);

    gate.release();
    await pending;
    expect(thirdResolved).toBe(true);
  });

  it("hands released slots to waiters in FIFO order", async () => {
    const gate = createConcurrencyGate(1);
    await gate.acquire();

    const order: number[] = [];
    const first = gate.acquire().then(() => order.push(1));
    const second = gate.acquire().then(() => order.push(2));

    gate.release();
    await first;
    gate.release();
    await second;

    expect(order).toEqual([1, 2]);
  });
});

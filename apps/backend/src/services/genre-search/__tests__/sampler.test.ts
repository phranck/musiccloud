import { describe, expect, it } from "vitest";
import { evenSpacedSample, stratifiedSample } from "@/services/genre-search/sampler";

/** Deterministic pseudo-RNG: simple LCG-ish, good enough for tests. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // Mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("stratifiedSample — edge cases", () => {
  it("returns [] for count <= 0", () => {
    expect(stratifiedSample([1, 2, 3], 0)).toEqual([]);
    expect(stratifiedSample([1, 2, 3], -5)).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(stratifiedSample([], 10)).toEqual([]);
  });

  it("returns a copy of the whole input when count >= input.length", () => {
    const input = [1, 2, 3];
    const out = stratifiedSample(input, 5);
    expect(out).toEqual(input);
    expect(out).not.toBe(input); // must be a new array, not the same reference
  });

  it("returns a copy of the input when count === input.length", () => {
    const out = stratifiedSample([1, 2, 3], 3);
    expect(out).toEqual([1, 2, 3]);
  });
});

describe("stratifiedSample — count matches request", () => {
  it("returns exactly count items when input is larger than count", () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    const out = stratifiedSample(input, 10, seededRng(1));
    expect(out).toHaveLength(10);
  });

  it("handles counts that don't divide by 3 cleanly", () => {
    const input = Array.from({ length: 90 }, (_, i) => i);
    const out = stratifiedSample(input, 11, seededRng(42));
    expect(out).toHaveLength(11);
  });

  it("handles count of 1", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const out = stratifiedSample(input, 1, seededRng(7));
    expect(out).toHaveLength(1);
  });
});

describe("stratifiedSample — stratification", () => {
  // Helper: build 30-item list, split into strata of 10, assert presence in each
  it("picks from all three strata for a count of 9 on 30 items", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const out = stratifiedSample(input, 9, seededRng(123));
    // Strata: [0..9], [10..19], [20..29] (even split)
    const fromTop = out.filter((x) => x >= 0 && x < 10);
    const fromMid = out.filter((x) => x >= 10 && x < 20);
    const fromTail = out.filter((x) => x >= 20 && x < 30);
    expect(fromTop).toHaveLength(3);
    expect(fromMid).toHaveLength(3);
    expect(fromTail).toHaveLength(3);
  });

  it("gives remainder picks to the top stratum", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const out = stratifiedSample(input, 11, seededRng(99));
    // 11 = 3 + 3 + 3 + 2 remainder → top gets 5, mid 3, tail 3
    const fromTop = out.filter((x) => x >= 0 && x < 10);
    const fromMid = out.filter((x) => x >= 10 && x < 20);
    const fromTail = out.filter((x) => x >= 20 && x < 30);
    expect(fromTop).toHaveLength(5);
    expect(fromMid).toHaveLength(3);
    expect(fromTail).toHaveLength(3);
  });

  it("absorbs the uneven remainder into the top stratum when n%3 != 0", () => {
    // 31 items: tail 10, middle 10, top 11. 9-count sample: 3/3/3, top pulls from 11.
    const input = Array.from({ length: 31 }, (_, i) => i);
    const out = stratifiedSample(input, 9, seededRng(5));
    const fromTop = out.filter((x) => x >= 0 && x < 11);
    const fromMid = out.filter((x) => x >= 11 && x < 21);
    const fromTail = out.filter((x) => x >= 21 && x < 31);
    expect(fromTop).toHaveLength(3);
    expect(fromMid).toHaveLength(3);
    expect(fromTail).toHaveLength(3);
  });
});

describe("stratifiedSample — non-destructive", () => {
  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const snapshot = [...input];
    stratifiedSample(input, 5, seededRng(1));
    expect(input).toEqual(snapshot);
  });

  it("returns picks without duplicates (items are unique)", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const out = stratifiedSample(input, 9, seededRng(500));
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("stratifiedSample — determinism under a fixed RNG", () => {
  it("produces the same output for the same seed", () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    const a = stratifiedSample(input, 9, seededRng(777));
    const b = stratifiedSample(input, 9, seededRng(777));
    expect(a).toEqual(b);
  });

  it("produces different outputs for different seeds (over many runs)", () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    const a = stratifiedSample(input, 9, seededRng(1));
    const b = stratifiedSample(input, 9, seededRng(2));
    expect(a).not.toEqual(b);
  });
});

describe("evenSpacedSample", () => {
  it("returns [] for count <= 0", () => {
    expect(evenSpacedSample([1, 2, 3], 0)).toEqual([]);
    expect(evenSpacedSample([1, 2, 3], -5)).toEqual([]);
  });

  it("returns [] for an empty pool", () => {
    expect(evenSpacedSample([], 10)).toEqual([]);
  });

  it("returns a copy of the pool when count >= pool.length", () => {
    const pool = [1, 2, 3];
    const out = evenSpacedSample(pool, 5);
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(pool);
  });

  it("picks items at evenly spaced indices for a divisible pool", () => {
    // pool of 100 items, count 10 → indices 0, 10, 20, …, 90
    const pool = Array.from({ length: 100 }, (_, i) => i);
    const out = evenSpacedSample(pool, 10);
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("handles a non-divisible pool/count pairing without gaps", () => {
    // pool=7, count=3 → indices 0, 2, 4 (floor(i*7/3))
    const pool = [10, 11, 12, 13, 14, 15, 16];
    expect(evenSpacedSample(pool, 3)).toEqual([10, 12, 14]);
  });

  it("always includes the first item of the pool (index 0)", () => {
    const pool = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    for (const n of [1, 2, 5, 10, 25, 49]) {
      const out = evenSpacedSample(pool, n);
      expect(out[0]).toBe(pool[0]);
      expect(out).toHaveLength(n);
    }
  });

  it("returns deterministic output for the same inputs", () => {
    const pool = Array.from({ length: 80 }, (_, i) => i);
    expect(evenSpacedSample(pool, 7)).toEqual(evenSpacedSample(pool, 7));
  });

  it("does not mutate the input array", () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const snapshot = [...pool];
    evenSpacedSample(pool, 3);
    expect(pool).toEqual(snapshot);
  });
});

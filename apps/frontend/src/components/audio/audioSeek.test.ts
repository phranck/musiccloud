import { describe, expect, it } from "vitest";
import { resolveSeekTarget } from "@/components/audio/audioSeek";

describe("resolveSeekTarget", () => {
  it("adds the delta within bounds", () => {
    expect(resolveSeekTarget(10, 10, 30)).toBe(20);
    expect(resolveSeekTarget(10, -10, 30)).toBe(0);
  });
  it("clamps to zero at the start", () => {
    expect(resolveSeekTarget(3, -10, 30)).toBe(0);
  });
  it("clamps to the real end when stepping forward", () => {
    expect(resolveSeekTarget(28, 10, 30)).toBe(30);
  });
});

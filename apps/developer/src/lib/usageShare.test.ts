import { describe, expect, it } from "vitest";
import { usageShare } from "./usageShare";

describe("usageShare", () => {
  it("reads a count against what the plan grants", () => {
    const share = usageShare(1200, 10000);

    expect(share.label).toBe("1,200 of 10,000");
    expect(share.percent).toBe(12);
    expect(share.exhausted).toBe(false);
  });

  it("says nothing is granted rather than dividing by a limit that does not exist", () => {
    const share = usageShare(42, null);

    expect(share.label).toBe("42 · no limit granted");
    expect(share.percent).toBeNull();
    expect(share.exhausted).toBe(false);
  });

  it("clamps the bar at full whilst still reporting the window as spent", () => {
    const share = usageShare(130, 100);

    expect(share.percent).toBe(100);
    expect(share.exhausted).toBe(true);
    expect(share.label).toBe("130 of 100");
  });

  it("counts a window as spent the moment it reaches its limit", () => {
    expect(usageShare(60, 60).exhausted).toBe(true);
    expect(usageShare(59, 60).exhausted).toBe(false);
  });

  it("treats a granted zero as nothing granted, because dividing by it says nothing", () => {
    const share = usageShare(5, 0);

    expect(share.percent).toBeNull();
    expect(share.exhausted).toBe(false);
  });
});

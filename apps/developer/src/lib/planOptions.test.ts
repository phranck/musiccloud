import { describe, expect, it } from "vitest";
import { makePublicTier } from "./__fixtures__/public-tier";
import { toPlanOptions } from "./planOptions";

describe("toPlanOptions", () => {
  it("takes assignability from the catalogue rather than deciding it here", () => {
    const [free, pro] = toPlanOptions([
      makePublicTier(),
      makePublicTier({ id: "tier_pro", name: "Pro", free: false, selfServiceAssignable: false }),
    ]);

    expect(free?.assignable).toBe(true);
    expect(free?.unavailableReason).toBe("");
    expect(pro?.assignable).toBe(false);
  });

  it("says a plan with a price is waiting on billing, because the catalogue calls it not free", () => {
    const [pro] = toPlanOptions([
      makePublicTier({ id: "tier_pro", name: "Pro", enabled: true, free: false, selfServiceAssignable: false }),
    ]);

    expect(pro?.unavailableReason).toBe("Not available yet. Paid plans arrive with billing.");
  });

  it("prefers the operator's own reason for a plan that is not offered", () => {
    const [retired] = toPlanOptions([
      makePublicTier({
        id: "tier_legacy",
        name: "Legacy",
        enabled: false,
        free: false,
        selfServiceAssignable: false,
        disableReason: "Replaced by Free in August.",
      }),
    ]);

    expect(retired?.unavailableReason).toBe("Replaced by Free in August.");
  });

  it("falls back to a plain reason when a disabled plan publishes none", () => {
    const [retired] = toPlanOptions([
      makePublicTier({
        id: "tier_legacy",
        name: "Legacy",
        enabled: false,
        selfServiceAssignable: false,
        disableReason: "  ",
      }),
    ]);

    expect(retired?.unavailableReason).toBe("Not currently offered.");
  });
});

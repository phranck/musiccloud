import { describe, expect, it } from "vitest";
import { type PublicTier, toPlanOptions } from "./planOptions";

function makeTier(overrides: Partial<PublicTier> = {}): PublicTier {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    enabled: true,
    selfServiceAssignable: true,
    disableReason: "",
    ...overrides,
  };
}

describe("toPlanOptions", () => {
  it("takes assignability from the catalogue rather than deciding it here", () => {
    const [free, pro] = toPlanOptions([
      makeTier(),
      makeTier({ id: "tier_pro", name: "Pro", selfServiceAssignable: false }),
    ]);

    expect(free?.assignable).toBe(true);
    expect(free?.unavailableReason).toBe("");
    expect(pro?.assignable).toBe(false);
  });

  it("says a plan that is offered but not purchasable is waiting on billing", () => {
    const [pro] = toPlanOptions([
      makeTier({ id: "tier_pro", name: "Pro", enabled: true, selfServiceAssignable: false }),
    ]);

    expect(pro?.unavailableReason).toBe("Not available yet. Paid plans arrive with billing.");
  });

  it("prefers the operator's own reason for a plan that is not offered", () => {
    const [retired] = toPlanOptions([
      makeTier({
        id: "tier_legacy",
        name: "Legacy",
        enabled: false,
        selfServiceAssignable: false,
        disableReason: "Replaced by Free in August.",
      }),
    ]);

    expect(retired?.unavailableReason).toBe("Replaced by Free in August.");
  });

  it("falls back to a plain reason when a disabled plan publishes none", () => {
    const [retired] = toPlanOptions([
      makeTier({
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

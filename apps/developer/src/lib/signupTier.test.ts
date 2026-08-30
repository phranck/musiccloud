import { describe, expect, it } from "vitest";
import { type SignupCatalogueTier, selectSignupTier } from "./signupTier";

function makeTier(overrides: Partial<SignupCatalogueTier> = {}): SignupCatalogueTier {
  return {
    id: "tier_free",
    name: "Free",
    color: "#38bdf8",
    selfServiceAssignable: true,
    ...overrides,
  };
}

describe("selectSignupTier", () => {
  it("signs up on the assignable plan when none was named", () => {
    const tier = selectSignupTier([
      makeTier({ id: "tier_pro", name: "Pro", selfServiceAssignable: false }),
      makeTier(),
    ]);

    expect(tier).toEqual({ id: "tier_free", name: "Free", color: "#38bdf8" });
  });

  it("signs up on the plan that was named", () => {
    const tier = selectSignupTier([makeTier(), makeTier({ id: "tier_indie", name: "Indie" })], "tier_indie");

    expect(tier?.id).toBe("tier_indie");
  });

  it("offers nothing for a named plan a developer may not take", () => {
    const tiers = [makeTier(), makeTier({ id: "tier_pro", name: "Pro", selfServiceAssignable: false })];

    expect(selectSignupTier(tiers, "tier_pro")).toBeNull();
  });

  it("offers nothing when no plan can be taken at all", () => {
    expect(selectSignupTier([makeTier({ selfServiceAssignable: false })])).toBeNull();
  });
});

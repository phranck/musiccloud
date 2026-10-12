import type { PublicTier } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { makePublicTier } from "./__fixtures__/public-tier";
import { selectSignupTier } from "./signupTier";

/** A catalogue plan with the accent color the signup form carries over. */
function makeTier(overrides: Partial<PublicTier> = {}): PublicTier {
  return makePublicTier({ color: "#38bdf8", ...overrides });
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

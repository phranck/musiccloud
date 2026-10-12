import type { PublicTier } from "@musiccloud/shared";

/**
 * A plan as the public catalogue serves it, free and choosable unless the
 * overrides say otherwise.
 *
 * Every portal test that hands the catalogue to a screen builds its plans
 * here, so a field the catalogue gains is added once.
 *
 * @param overrides - The fields that differ from the free default.
 * @returns A complete catalogue entry.
 */
export function makePublicTier(overrides: Partial<PublicTier> = {}): PublicTier {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
    free: true,
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    selfServiceAssignable: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

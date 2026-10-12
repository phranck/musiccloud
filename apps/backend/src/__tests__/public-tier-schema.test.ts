import type { PublicTier } from "@musiccloud/shared";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { PublicTierSchema } from "../schemas/openapi-schemas.js";

/**
 * A complete catalogue entry, typed as the shared `PublicTier`.
 *
 * The type has no optional field, so the compiler holds this object to exactly
 * the type's keys, and its keys are what the schema is compared against.
 */
const example: PublicTier = {
  id: "tier_pro",
  name: "Pro",
  requestsPerMinute: 600,
  requestsPerDay: 100000,
  attributionRequired: false,
  price: "9.90",
  priceYearly: "99",
  free: false,
  color: "#3b82f6",
  icon: "Crown1",
  buttonLabel: "Go Pro",
  description: "For apps in production.",
  enabled: true,
  selfServiceAssignable: false,
  disableReason: "",
  recommended: true,
  sortOrder: 1,
  features: ["100,000 requests per day"],
  createdAt: 1784138400000,
  updatedAt: 1784138400000,
};

/**
 * The public catalogue's response schema forbids properties it does not name,
 * so a field the shared type gains and the schema does not is removed from
 * every response without an error. These tests fail on that, in either
 * direction.
 */
describe("PublicTierSchema and the shared PublicTier type", () => {
  it("names every key of the type as a property and as required", () => {
    const keys = Object.keys(example).sort();

    expect(Object.keys(PublicTierSchema.properties).sort()).toEqual(keys);
    expect([...PublicTierSchema.required].sort()).toEqual(keys);
  });

  it("sends a typed catalogue entry through the response schema unchanged", async () => {
    const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
    app.addSchema(PublicTierSchema);
    app.get("/tier", { schema: { response: { 200: { $ref: "PublicTier#" } } } }, async () => example);

    const response = await app.inject({ method: "GET", url: "/tier" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(example);
    await app.close();
  });
});

/**
 * @file Public OpenAPI schemas for platform status and plans: the health probe
 * responses and the public API tier. They describe the shapes in
 * `@musiccloud/shared`'s `api.ts`, and `OPENAPI_SCHEMAS` registers them with
 * the rest.
 */

import { DEFAULT_TIER_COLOR, TIER_COLOR_PATTERN } from "@musiccloud/shared";

/** Standard availability response returned by public health probes. */
export const HealthStatusResponseSchema = {
  $id: "HealthStatusResponse",
  type: "object",
  description: "Standard availability response returned when a public health probe is ready.",
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ok"], description: "Always `ok` when the probe completed successfully." },
  },
  example: { status: "ok" },
} as const;

/** Error response returned by public readiness probes while a dependency is unavailable. */
export const HealthUnavailableResponseSchema = {
  $id: "HealthUnavailableResponse",
  type: "object",
  description:
    "Readiness failure with the standard public error envelope. Internal dependency diagnostics are available only in backend logs correlated by `errorId`.",
  required: ["error", "message", "errorId"],
  additionalProperties: false,
  properties: {
    error: { type: "string", description: "Stable musiccloud error code for programmatic handling." },
    message: {
      type: "string",
      description: "Safe English failure detail. The final parenthesized value repeats `error`.",
    },
    errorId: {
      type: "string",
      format: "uuid",
      description: "Unique incident identifier to include when reporting the failure to musiccloud support.",
    },
    context: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
      description: "Optional structured values associated with the error code. The key is omitted when none apply.",
    },
    status: {
      type: "string",
      enum: ["unavailable"],
      description:
        "Optional compatibility status used by non-database service probes when their dependency is unavailable.",
    },
  },
  example: {
    error: "MC-API-0001",
    message: "Database readiness could not be confirmed. Please try again later. (MC-API-0001)",
    errorId: "3d39ea9f-27ea-4f61-862e-c92547bd538c",
  },
} as const;

/** Public API plan shown by the Developer Portal pricing page. */
export const PublicTierSchema = {
  $id: "PublicTier",
  type: "object",
  description: "One public API plan, including its request limits, pricing, availability, and presentation metadata.",
  required: [
    "id",
    "name",
    "requestsPerMinute",
    "requestsPerDay",
    "attributionRequired",
    "price",
    "priceCurrency",
    "priceYearly",
    "priceYearlyCurrency",
    "color",
    "icon",
    "buttonLabel",
    "description",
    "enabled",
    "disableReason",
    "free",
    "selfServiceAssignable",
    "recommended",
    "sortOrder",
    "features",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Stable opaque plan identifier. It is returned for account-selection and billing correlation; no public API parameter currently accepts it.",
    },
    name: { type: "string", description: "Human-readable plan name." },
    requestsPerMinute: {
      type: "integer",
      minimum: 1,
      description: "Maximum authenticated requests in a rolling `60`-second window.",
    },
    requestsPerDay: {
      type: "integer",
      minimum: 1,
      description: "Maximum authenticated requests in a rolling `24`-hour window.",
    },
    attributionRequired: {
      type: "boolean",
      description: "Whether applications on this plan must show musiccloud attribution.",
    },
    price: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "Monthly price in whole units of `priceCurrency` as a decimal string, or `null` when no monthly paid price applies.",
    },
    priceCurrency: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "ISO 4217 code of the currency `price` is charged in, such as `EUR` or `USD`. `null` exactly when `price` is `null`.",
    },
    priceYearly: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "Yearly price in whole units of `priceYearlyCurrency` as a decimal string, or `null` when yearly billing is not offered.",
    },
    priceYearlyCurrency: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "ISO 4217 code of the currency `priceYearly` is charged in, such as `EUR` or `USD`. `null` exactly when `priceYearly` is `null`.",
    },
    color: { type: "string", pattern: TIER_COLOR_PATTERN.source, description: "Plan accent color as `#RRGGBB`." },
    icon: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "The key is always included. Its value is an Iconsax icon identifier used for presentation, or `null` when no icon is assigned.",
    },
    buttonLabel: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "The key is always included. Its value is a custom call-to-action label, or `null` when no custom label is published.",
    },
    description: {
      type: "string",
      description: "Short plan description; an empty string means no description is published.",
    },
    enabled: { type: "boolean", description: "Whether new accounts can currently select this plan." },
    free: {
      type: "boolean",
      description:
        "Whether the plan costs nothing. A plan that is not free can have `null` for both prices when it is sold over another interval.",
    },
    selfServiceAssignable: {
      type: "boolean",
      description:
        "Whether a developer can put a project on this plan themselves, which holds for an `enabled` plan that is `free`. A plan that is offered but not yet purchasable is `enabled` and not assignable.",
    },
    disableReason: {
      type: "string",
      description: "Reason an unavailable plan cannot be selected; an empty string means no reason is published.",
    },
    recommended: { type: "boolean", description: "Whether this plan is highlighted as the recommended option." },
    sortOrder: { type: "integer", description: "Ascending display order used by the pricing page." },
    features: {
      type: "array",
      items: { type: "string" },
      description: "Ordered feature labels; an empty array means none are listed.",
    },
    createdAt: { type: "integer", minimum: 0, description: "Plan creation time as Unix epoch milliseconds." },
    updatedAt: { type: "integer", minimum: 0, description: "Last plan update time as Unix epoch milliseconds." },
  },
  example: {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: true,
    price: null,
    priceCurrency: null,
    priceYearly: null,
    priceYearlyCurrency: null,
    color: DEFAULT_TIER_COLOR,
    icon: null,
    buttonLabel: null,
    description: "For evaluation and small personal projects.",
    enabled: true,
    disableReason: "",
    free: true,
    selfServiceAssignable: true,
    recommended: false,
    sortOrder: 0,
    features: ["10,000 requests per day"],
    createdAt: 1784138400000,
    updatedAt: 1784138400000,
  },
} as const;

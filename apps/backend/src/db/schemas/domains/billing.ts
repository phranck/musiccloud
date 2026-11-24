import {
  API_CLIENT_STATUSES,
  API_TOKEN_STATUSES,
  BILLING_PERIODS,
  CLIENT_REGISTRATION_TYPES,
  CREEM_MODES,
  DEFAULT_TIER_COLOR,
  DEVELOPER_PROJECT_STATUSES,
  OFFER_CURRENCIES,
  SUBSCRIPTION_STATUSES,
  TAX_CATEGORIES,
  TAX_MODES,
} from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./admin-users.js";
import { sqlValueList } from "./column-types.js";
import { developerAccounts } from "./developer-accounts.js";

/**
 * Creem billing detail per paid subscription, mirroring Creem's billing state
 * and nothing else. Free accounts have no row here. `creemSubscriptionId` is
 * unique so an idempotent webhook can upsert by it.
 *
 * What a key is allowed to do is decided one level down, by the subscription
 * on the project (`developer_project_subscriptions`), which is what
 * `authenticatePublic` resolves the quota from. `developer_accounts.tier_id`
 * is displayed on the account and enforces nothing.
 *
 * This table is scheduled for retirement in #183, because the project
 * subscription is where a plan already lives.
 */
export const developerSubscriptions = pgTable(
  "developer_subscriptions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    tierId: text("tier_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "restrict" }),
    creemSubscriptionId: text("creem_subscription_id").notNull().unique(),
    creemCustomerId: text("creem_customer_id").notNull(),
    status: text("status").notNull(),
    interval: text("interval").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_developer_subscriptions_creem_id").on(table.creemSubscriptionId),
    check("chk_developer_subscriptions_status", sql`${table.status} IN (${sqlValueList(SUBSCRIPTION_STATUSES)})`),
    check("chk_developer_subscriptions_interval", sql`${table.interval} IN ('month', 'year')`),
  ],
);

export type DeveloperSubscriptionRow = typeof developerSubscriptions.$inferSelect;
export type DeveloperSubscriptionInsert = typeof developerSubscriptions.$inferInsert;

/**
 * Developer-owned API project. Projects are the aggregate boundary for
 * subscriptions, quota overrides, client registrations, and usage. The
 * account remains the owner while project lifecycle changes only affect
 * credentials registered under that project.
 */
export const developerProjects = pgTable(
  "developer_projects",
  {
    id: text("id").primaryKey(),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    requestsPerMinute: integer("requests_per_minute"),
    requestsPerDay: integer("requests_per_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdByAdminId: text("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_developer_projects_account_status").on(table.developerAccountId, table.status),
    check("chk_developer_projects_status", sql`${table.status} IN (${sqlValueList(DEVELOPER_PROJECT_STATUSES)})`),
    check(
      "chk_developer_projects_requests_per_minute",
      sql`${table.requestsPerMinute} IS NULL OR ${table.requestsPerMinute} > 0`,
    ),
    check(
      "chk_developer_projects_requests_per_day",
      sql`${table.requestsPerDay} IS NULL OR ${table.requestsPerDay} > 0`,
    ),
  ],
);

export type DeveloperProjectRow = typeof developerProjects.$inferSelect;
export type DeveloperProjectInsert = typeof developerProjects.$inferInsert;

/**
 * Billing and tariff state for one project. A project has at most one row;
 * `tierId` may be null while legacy accounts are backfilled or when a project
 * intentionally relies on the conservative fallback limits.
 */
export const developerProjectSubscriptions = pgTable(
  "developer_project_subscriptions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => developerProjects.id, { onDelete: "cascade" }),
    tierId: text("tier_id").references(() => tiers.id, { onDelete: "restrict" }),
    creemSubscriptionId: text("creem_subscription_id"),
    creemCustomerId: text("creem_customer_id"),
    status: text("status").notNull().default("active"),
    interval: text("interval"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_developer_project_subscriptions_project").on(table.projectId),
    uniqueIndex("uq_developer_project_subscriptions_creem_id")
      .on(table.creemSubscriptionId)
      .where(sql`${table.creemSubscriptionId} IS NOT NULL`),
    check(
      "chk_developer_project_subscriptions_status",
      sql`${table.status} IN (${sqlValueList(SUBSCRIPTION_STATUSES)})`,
    ),
    check(
      "chk_developer_project_subscriptions_interval",
      sql`${table.interval} IS NULL OR ${table.interval} IN (${sqlValueList(BILLING_PERIODS)})`,
    ),
  ],
);

export type DeveloperProjectSubscriptionRow = typeof developerProjectSubscriptions.$inferSelect;
export type DeveloperProjectSubscriptionInsert = typeof developerProjectSubscriptions.$inferInsert;

/**
 * What a plan costs, as one row per thing a customer can buy.
 *
 * A plan says what somebody gets; an offer says what they pay for it, and it
 * is the only place a plan's price is held. An offer is exactly what Creem
 * calls a product, so every field Creem accepts has a column here rather than
 * being invented by our code when the product is created.
 *
 * `billingPeriod` carries Creem's own spelling, so the value travels to the
 * API unchanged. Creem admits six, of which `once` is the one that is not
 * recurring and therefore the only one that may set the pay-what-you-want
 * fields.
 *
 * A plan has at most one offer per billing period. Selling the same plan twice
 * over the same period is not a case; it is a mistake somebody would only find
 * on the pricing page.
 */
export const tierOffers = pgTable(
  "tier_offers",
  {
    id: text("id").primaryKey(),
    tierId: text("tier_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "cascade" }),
    /** Creem's own spelling of the period, such as `every-month`. */
    billingPeriod: text("billing_period").notNull(),
    /** The amount in the smallest currency unit, which is what Creem takes. */
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    /** Whether tax is inside the price or added to it. `NULL` leaves it to Creem. */
    taxMode: text("tax_mode"),
    /** The tax treatment of what is being sold. `NULL` leaves it to Creem. */
    taxCategory: text("tax_category"),
    /** The picture on the checkout page. */
    imageUrl: text("image_url"),
    /** Where the customer returns after paying. Checked against our own hosts. */
    successUrl: text("success_url"),
    /** Up to three extra questions asked at the checkout. */
    customFields: jsonb("custom_fields").notNull().default([]),
    abandonedCartRecovery: boolean("abandoned_cart_recovery").notNull().default(false),
    /** Only meaningful for a `once` offer, where the customer names the amount. */
    payWhatYouWant: boolean("pay_what_you_want").notNull().default(false),
    /** The amount pre-filled when the customer names it. */
    suggestedPriceCents: integer("suggested_price_cents"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tier_offers_tier_period").on(table.tierId, table.billingPeriod),
    check("chk_tier_offers_billing_period", sql`${table.billingPeriod} IN (${sqlValueList(BILLING_PERIODS)})`),
    check("chk_tier_offers_currency", sql`${table.currency} IN (${sqlValueList(OFFER_CURRENCIES)})`),
    check(
      "chk_tier_offers_tax_mode",
      sql`${table.taxMode} IS NULL OR ${table.taxMode} IN (${sqlValueList(TAX_MODES)})`,
    ),
    check(
      "chk_tier_offers_tax_category",
      sql`${table.taxCategory} IS NULL OR ${table.taxCategory} IN (${sqlValueList(TAX_CATEGORIES)})`,
    ),
    // Creem refuses a recurring product below one whole unit of the currency
    // and accepts zero only for a one-time product.
    check("chk_tier_offers_price", sql`${table.priceCents} >= 100`),
    check("chk_tier_offers_pay_what_you_want", sql`${table.payWhatYouWant} = false OR ${table.billingPeriod} = 'once'`),
  ],
);

export type TierOfferRow = typeof tierOffers.$inferSelect;
export type TierOfferInsert = typeof tierOffers.$inferInsert;

/**
 * Maps each offer and Creem environment to its Creem product id. Creem
 * products carry no metadata field, so the offer-to-product association cannot
 * live at Creem and lives here instead. Creem stays the source of truth for
 * prices only, fetched live by the catalog service. A row is written by the
 * plan editor when it creates the product in Creem and removed when it
 * archives one, and the whole table is cleared by the dbdump scrub because the
 * product ids are environment-specific.
 *
 * `mode` says which Creem environment the product belongs to. Test and live are
 * separate accounts that share nothing, so one offer has two different product
 * ids and both have to be held at once: the sandbox keeps working whilst the
 * live set is created. A process only ever reads the rows matching the mode its
 * API key puts it in. The column defaults to `test` because a mislabelled
 * sandbox product merely fails to appear in live, whilst the opposite would
 * offer a sandbox product for real money.
 *
 * creemProductId is globally unique, because a product id belongs to one
 * environment and cannot appear twice.
 *
 * The two permitted modes are also named in `CreemMode` in
 * `apps/backend/src/lib/creem-config.ts`, which is what the application
 * compares against. They are apart because a check constraint is raw SQL and
 * cannot read a TypeScript constant, so
 * `postgres-tiers-creem-products.integration.test.ts` holds them together by
 * round-tripping both members through the database.
 */
export const tierCreemProducts = pgTable(
  "tier_creem_products",
  {
    id: text("id").primaryKey(),
    tierId: text("tier_id").notNull(),
    /**
     * The offer's billing period, in Creem's own spelling. Named `interval`
     * because that is what the column has always been called; its permitted
     * values widened from two to Creem's six when offers arrived.
     */
    interval: text("interval").notNull(),
    mode: text("mode").notNull().default("test"),
    creemProductId: text("creem_product_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tier_creem_products_tier_interval_mode").on(table.tierId, table.interval, table.mode),
    check("chk_tier_creem_products_mode", sql`${table.mode} IN (${sqlValueList(CREEM_MODES)})`),
    // The mapping addresses an offer by the offer's own natural key, so a
    // product cannot point at a period the plan does not sell, and removing an
    // offer takes its products with it.
    foreignKey({
      name: "fk_tier_creem_products_offer",
      columns: [table.tierId, table.interval],
      foreignColumns: [tierOffers.tierId, tierOffers.billingPeriod],
    }).onDelete("cascade"),
  ],
);

export type TierCreemProductRow = typeof tierCreemProducts.$inferSelect;
export type TierCreemProductInsert = typeof tierCreemProducts.$inferInsert;

/**
 * A registered API consumer ("app"), linked to the developer account and the
 * project that own it. `requestsPerMinute`/`requestsPerDay` are per-key
 * overrides: `NULL` inherits the owning project's tier limits, a value takes
 * precedence (a "custom tier"). The effective limits are enforced centrally
 * in `authenticatePublic` (plugins/auth.ts).
 */
export const apiClients = pgTable(
  "api_clients",
  {
    id: text("id").primaryKey(),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => developerProjects.id, { onDelete: "set null" }),
    publicClientId: text("public_client_id")
      .notNull()
      .default(sql`'mc_client_' || replace(gen_random_uuid()::text, '-', '')`),
    registrationType: text("registration_type").notNull().default("development"),
    capabilities: jsonb("capabilities").notNull().default(["legacy_api_key"]),
    appName: text("app_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    description: text("description").notNull(),
    /**
     * Where this one application can be looked at: its own page, its listing,
     * or its repository. It sits on the registration rather than on the
     * account because a website describes one application and an account can
     * hold several. Optional, and constrained to `http` or `https` at the
     * route boundary.
     */
    websiteUrl: text("website_url"),
    status: text("status").notNull().default("active"),
    requestsPerMinute: integer("requests_per_minute"),
    requestsPerDay: integer("requests_per_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByAdminId: text("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_api_clients_status").on(table.status),
    index("idx_api_clients_developer_account").on(table.developerAccountId),
    index("idx_api_clients_project_status").on(table.projectId, table.status),
    uniqueIndex("uq_api_clients_public_client_id").on(table.publicClientId),
    check("chk_api_clients_status", sql`${table.status} IN (${sqlValueList(API_CLIENT_STATUSES)})`),
    check(
      "chk_api_clients_registration_type",
      sql`${table.registrationType} IN (${sqlValueList(CLIENT_REGISTRATION_TYPES)})`,
    ),
    check(
      "chk_api_clients_requests_per_minute",
      sql`${table.requestsPerMinute} IS NULL OR ${table.requestsPerMinute} > 0`,
    ),
    check("chk_api_clients_requests_per_day", sql`${table.requestsPerDay} IS NULL OR ${table.requestsPerDay} > 0`),
  ],
);

export type ApiClientRow = typeof apiClients.$inferSelect;
export type ApiClientInsert = typeof apiClients.$inferInsert;

/**
 * An issued bearer token for an {@link apiClients} row, sent as
 * `X-API-Key: <uuid-v4>`. Only the SHA-256 hash is persisted (`tokenHash`),
 * so the token itself exists once, in the response that issues it, and
 * nowhere afterwards; `tokenPrefix` is safe to display. Both admins
 * and the owning developer can create/revoke/rotate tokens through
 * `api-access-repository.ts`. `rotatedFromTokenId` is informational only
 * (no FK constraint, to avoid a self-referential-FK typing detour for a
 * field that is never used for integrity checks, only display history).
 */
export const apiClientTokens = pgTable(
  "api_client_tokens",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => apiClients.id, { onDelete: "cascade" }),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedFromTokenId: text("rotated_from_token_id"),
  },
  (table) => [
    uniqueIndex("uq_api_client_tokens_prefix").on(table.tokenPrefix),
    uniqueIndex("uq_api_client_tokens_hash").on(table.tokenHash),
    index("idx_api_client_tokens_client_status").on(table.clientId, table.status),
    check("chk_api_client_tokens_status", sql`${table.status} IN (${sqlValueList(API_TOKEN_STATUSES)})`),
  ],
);

export type ApiClientTokenRow = typeof apiClientTokens.$inferSelect;
export type ApiClientTokenInsert = typeof apiClientTokens.$inferInsert;

/**
 * Project-scoped usage attribution for completed token-authenticated API
 * requests. Only stable routing and timing metadata is retained; request
 * bodies, credentials, and authorization headers are never stored.
 */
export const apiUsageEvents = pgTable(
  "api_usage_events",
  {
    id: text("id").primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    requestId: text("request_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => developerProjects.id, { onDelete: "cascade" }),
    registrationId: text("registration_id")
      .notNull()
      .references(() => apiClients.id, { onDelete: "cascade" }),
    tokenId: text("token_id").references(() => apiClientTokens.id, { onDelete: "set null" }),
    method: text("method").notNull(),
    endpointTemplate: text("endpoint_template").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
  },
  (table) => [
    index("idx_api_usage_events_project_occurred").on(table.projectId, table.occurredAt),
    index("idx_api_usage_events_registration_occurred").on(table.registrationId, table.occurredAt),
    // The retention sweep filters on time alone. Both indexes above lead with
    // an id, so without this one the nightly delete is a sequential scan of a
    // table that gains a row per authenticated request.
    index("idx_api_usage_events_occurred").on(table.occurredAt),
    check("chk_api_usage_events_status_code", sql`${table.statusCode} BETWEEN 100 AND 599`),
    check("chk_api_usage_events_duration_ms", sql`${table.durationMs} >= 0`),
  ],
);

export type ApiUsageEventRow = typeof apiUsageEvents.$inferSelect;
export type ApiUsageEventInsert = typeof apiUsageEvents.$inferInsert;

/**
 * Audit trail for every mutating action on projects, registrations and tokens.
 * `actorAdminId` is set for admin-initiated actions, `actorDeveloperAccountId`
 * for developer self-service actions. Exactly one of the two is set (never
 * both, never neither) by every writer in `api-access-repository.ts`.
 */
export const apiAccessAuditEvents = pgTable(
  "api_access_audit_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => developerProjects.id, { onDelete: "set null" }),
    clientId: text("client_id").references(() => apiClients.id, { onDelete: "set null" }),
    tokenId: text("token_id").references(() => apiClientTokens.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    actorAdminId: text("actor_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorDeveloperAccountId: text("actor_developer_account_id").references(() => developerAccounts.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    eventData: jsonb("event_data").notNull().default({}),
  },
  (table) => [
    index("idx_api_access_audit_events_client_occurred").on(table.clientId, table.occurredAt),
    // The admin audit read asks for one project's trail over a range.
    index("idx_api_access_audit_events_project_occurred").on(table.projectId, table.occurredAt),
  ],
);

export type ApiAccessAuditEventRow = typeof apiAccessAuditEvents.$inferSelect;
export type ApiAccessAuditEventInsert = typeof apiAccessAuditEvents.$inferInsert;

/**
 * API tariff tiers (MC-092). Managed in the admin dashboard and displayed on
 * the Developer Portal pricing page. Assigned to developer accounts via
 * `developer_accounts.tier_id` (MC-100); a tier supplies the default rate
 * limits, which {@link apiClients} rows can override per key.
 */
export const tiers = pgTable(
  "tiers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    requestsPerMinute: integer("requests_per_minute").notNull(),
    requestsPerDay: integer("requests_per_day").notNull(),
    attributionRequired: boolean("attribution_required").notNull().default(false),
    color: text("color").notNull().default(DEFAULT_TIER_COLOR),
    icon: text("icon"),
    buttonLabel: text("button_label"),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    disableReason: text("disable_reason").notNull().default(""),
    recommended: boolean("recommended").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    features: jsonb("features").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_tiers_requests_per_minute", sql`${table.requestsPerMinute} > 0`),
    check("chk_tiers_requests_per_day", sql`${table.requestsPerDay} > 0`),
  ],
);

export type TierRow = typeof tiers.$inferSelect;
export type TierInsert = typeof tiers.$inferInsert;

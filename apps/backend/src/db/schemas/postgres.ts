/**
 * The Drizzle schema of the Postgres database, one file per domain under `domains/`.
 *
 * `drizzle.config.postgres.ts` and every importer read the schema from this file, so it
 * re-exports every table of every domain. `domains/column-types.ts` holds column helpers
 * and no tables, so it is not re-exported.
 */

import {
  API_CLIENT_STATUSES,
  API_TOKEN_STATUSES,
  BANK_CONSENT_NOTICE_STAGES,
  BANK_READ_KINDS,
  BILLING_PERIODS,
  CLIENT_REGISTRATION_TYPES,
  CREEM_MODES,
  DEFAULT_TIER_COLOR,
  DEVELOPER_ACCOUNT_STATUSES,
  DEVELOPER_PROJECT_STATUSES,
  DONATION_CURRENCY,
  DONATION_PROVIDERS,
  OFFER_CURRENCIES,
  type SocialMediaLinks,
  SUBSCRIPTION_STATUSES,
  SUPPORT_PROMPT_DEFAULTS,
  type SupportPromptButtonAlignment,
  type SupportPromptSlot,
  type SupportPromptThresholdBasis,
  TAX_CATEGORIES,
  TAX_MODES,
} from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./domains/admin-users.js";
import { bytea, sqlValueList } from "./domains/column-types.js";

export * from "./domains/admin-users.js";
export * from "./domains/album-catalog.js";
export * from "./domains/artist-cache.js";
export * from "./domains/artist-credits.js";
export * from "./domains/artist-identity.js";
export * from "./domains/artist-profiles.js";
export * from "./domains/content-navigation.js";
export * from "./domains/email.js";
export * from "./domains/media-caches.js";
export * from "./domains/site-settings.js";
export * from "./domains/track-catalog.js";
export * from "./domains/vinyl-layouts.js";

// Error/telemetry events posted by the Apple client (Testflight only).
// The table has no foreign keys, because entries must survive user/install churn so we can still
// correlate historical issues. `install_id` is an opaque random UUID the
// client keeps in its Keychain; it is not linked to any admin user.
/**
 * Native app telemetry events submitted by the Apple client.
 * Keeps install-scoped diagnostics and resolve errors without foreign keys so
 * historical entries survive account or install churn.
 */
export const appTelemetryEvents = pgTable(
  "app_telemetry_events",
  {
    id: serial("id").primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    installId: text("install_id").notNull(),
    appVersion: text("app_version").notNull(),
    buildNumber: text("build_number").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version").notNull(),
    deviceModel: text("device_model").notNull(),
    locale: text("locale").notNull(),
    sourceUrl: text("source_url"),
    service: text("service"),
    errorKind: text("error_kind").notNull(),
    httpStatus: integer("http_status"),
    message: text("message").notNull(),
  },
  (table) => [
    index("idx_app_telemetry_received_at").on(table.receivedAt),
    index("idx_app_telemetry_install_received").on(table.installId, table.receivedAt),
  ],
);

export type AppTelemetryEventRow = typeof appTelemetryEvents.$inferSelect;
export type AppTelemetryEventInsert = typeof appTelemetryEvents.$inferInsert;

/**
 * App Attest keys of the Apple app, one row per key a device attested.
 *
 * A row exists only after Apple's attestation of the key verified, so holding
 * the private half of a key listed here is what proves a request comes from a
 * genuine build of the app. `key_id` is Apple's own identifier, the base64
 * SHA-256 of the public key, and `public_key` is that key as an X9.62
 * uncompressed point, which is what assertions are verified against.
 *
 * `sign_count` is the counter of the last assertion accepted. Apple increments
 * it on every assertion, so a new one must be strictly greater, which is what
 * stops an assertion from being replayed. It is an unsigned 32-bit value on the
 * device, so it needs a `bigint` here. `environment` says whether Apple's
 * development or production service attested the key. A key with `revoked_at`
 * set is refused even while a session token issued to it is still valid.
 */
export const appAttestKeys = pgTable(
  "app_attest_keys",
  {
    keyId: text("key_id").primaryKey(),
    publicKey: bytea("public_key").notNull(),
    signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
    environment: text("environment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check("chk_app_attest_keys_environment", sql`${table.environment} IN ('production', 'development')`),
    check("chk_app_attest_keys_sign_count", sql`${table.signCount} BETWEEN 0 AND 4294967295`),
  ],
);

export type AppAttestKeyRow = typeof appAttestKeys.$inferSelect;
export type AppAttestKeyInsert = typeof appAttestKeys.$inferInsert;

/**
 * One-time challenges the Apple app signs into an attestation or an assertion.
 *
 * A challenge is consumed by deleting its row, so it can be used once, and it
 * is refused after `expires_at`. Expired rows are removed whenever a new
 * challenge is issued, which keeps the table at the size of the last few
 * minutes of traffic.
 */
export const appAttestChallenges = pgTable(
  "app_attest_challenges",
  {
    challenge: text("challenge").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_app_attest_challenges_expires_at").on(table.expiresAt)],
);

// Per-source crawler state. Populated lazily on heartbeat tick via
// idempotent ON CONFLICT DO NOTHING upsert from the in-memory registry,
// so adding a new source costs zero migration work. Mutable fields
// (`enabled`, `intervalMinutes`, `config`, `cursor`) are written from the
// admin API at runtime; transient fields (`runningSince`, `lastRunAt`,
// `nextRunAt`, `consecutiveErrors`, `lastError`) are written by the
// heartbeat itself. Partial index on `nextRunAt WHERE enabled = true`
// keeps the per-minute "is anything due?" probe O(log n_active).
/**
 * Mutable scheduler state for each registered crawler source.
 * Seeded idempotently from the in-memory source registry and updated by the
 * admin API and heartbeat runner.
 */
export const crawlState = pgTable(
  "crawl_state",
  {
    source: text("source").primaryKey(),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    intervalMinutes: integer("interval_minutes").notNull().default(360),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    cursor: jsonb("cursor"),
    config: jsonb("config").notNull().default({}),
    runningSince: timestamp("running_since", { withTimezone: true }),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  },
  (table) => [index("idx_crawl_state_due").on(table.nextRunAt).where(sql`${table.enabled} = true`)],
);

export type CrawlStateRow = typeof crawlState.$inferSelect;
export type CrawlStateInsert = typeof crawlState.$inferInsert;

// Per-tick observability log. One row per source per heartbeat tick that
// did real work (skipped/locked ticks are recorded as `status = 'skipped'`
// only when a tick was actually attempted but lock acquisition failed,
// while purely idle minutes write nothing). Counters get finalized in the same
// transaction as the `crawl_state` update.
/**
 * Historical crawler heartbeat run records.
 * Captures per-tick status, counters and notes for admin observability and
 * debugging of background ingestion sources.
 */
export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(), // 'running' | 'success' | 'error' | 'aborted' | 'skipped'
    discovered: integer("discovered").notNull().default(0),
    ingested: integer("ingested").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [
    index("idx_crawl_runs_source_started").on(table.source, table.startedAt.desc()),
    index("idx_crawl_runs_started_at").on(table.startedAt.desc()),
  ],
);

export type CrawlRunRow = typeof crawlRuns.$inferSelect;
export type CrawlRunInsert = typeof crawlRuns.$inferInsert;

// ============================================================================
// CREATIVE COMMONS (Jamendo). These entity families share nothing with the commercial catalog.
// ============================================================================

/**
 * Creative-Commons artists resolved from Jamendo.
 * Slim by design: a single localized bio blob, no normalized identity graph.
 */
export const ccArtists = pgTable(
  "cc_artists",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    website: text("website"),
    bio: jsonb("bio"), // localized { en, de, ... }
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("uq_cc_artists_jamendo_id").on(table.jamendoId), index("idx_cc_artists_name").on(table.name)],
);

/**
 * Creative-Commons albums resolved from Jamendo.
 */
export const ccAlbums = pgTable(
  "cc_albums",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    artworkUrl: text("artwork_url"),
    releaseDate: text("release_date"),
    zipUrl: text("zip_url"),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_albums_jamendo_id").on(table.jamendoId),
    index("idx_cc_albums_cc_artist_id").on(table.ccArtistId),
  ],
);

/**
 * Creative-Commons tracks resolved from Jamendo.
 * `stream_url` is the permanent full-track stream (no expiry, unlike commercial
 * previews). `download_allowed` mirrors Jamendo's `audiodownload_allowed`.
 */
export const ccTracks = pgTable(
  "cc_tracks",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    albumName: text("album_name"),
    ccAlbumId: text("cc_album_id").references(() => ccAlbums.id),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    licenseCcurl: text("license_ccurl"),
    streamUrl: text("stream_url").notNull(),
    downloadUrl: text("download_url"),
    downloadAllowed: integer("download_allowed"),
    waveform: text("waveform"),
    shareUrl: text("share_url"),
    // 1-based position within an album's tracklist; set when this track is
    // persisted as part of an album resolve, NULL for standalone single resolves.
    albumPosition: integer("album_position"),
    // 0-based rank within its artist's popularity-ordered top-tracks; set when
    // persisted as part of an artist resolve, NULL otherwise.
    artistTopPosition: integer("artist_top_position"),
    // `include=musicinfo` classification + `include=stats` counters, captured at
    // single-track resolve so the share page renders the details card from the DB.
    musicInfo: jsonb("music_info"),
    stats: jsonb("stats"),
    // Jamendo Pro licensing flag (0/1) + page URL (`include=licenses`).
    proLicensing: integer("pro_licensing"),
    proUrl: text("pro_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_tracks_jamendo_id").on(table.jamendoId),
    index("idx_cc_tracks_cc_artist_id").on(table.ccArtistId),
    index("idx_cc_tracks_cc_album_id").on(table.ccAlbumId),
    index("idx_cc_tracks_title").on(table.title),
    index("idx_cc_tracks_created_at").on(table.createdAt.desc()),
  ],
);

/**
 * Public short-code mapping for CC track share pages.
 * Mirrors the commercial `short_urls` pattern (`id` is the code, one per track),
 * but is created eagerly on track persistence so every CC track is immediately
 * shareable and playlist-ready.
 */
export const ccShortUrls = pgTable(
  "cc_short_urls",
  {
    id: text("id").primaryKey(),
    ccTrackId: text("cc_track_id")
      .notNull()
      .references(() => ccTracks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_short_urls_cc_track_id").on(table.ccTrackId),
    uniqueIndex("uq_cc_short_urls_cc_track_id").on(table.ccTrackId),
  ],
);

/**
 * Public short-code mapping for CC album share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC album so a resolved CC album is immediately shareable.
 */
export const ccAlbumShortUrls = pgTable(
  "cc_album_short_urls",
  {
    id: text("id").primaryKey(),
    ccAlbumId: text("cc_album_id")
      .notNull()
      .references(() => ccAlbums.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
    uniqueIndex("uq_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
  ],
);

/**
 * Public short-code mapping for CC artist share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC artist so a resolved CC artist is immediately shareable.
 */
export const ccArtistShortUrls = pgTable(
  "cc_artist_short_urls",
  {
    id: text("id").primaryKey(),
    ccArtistId: text("cc_artist_id")
      .notNull()
      .references(() => ccArtists.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
    uniqueIndex("uq_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
  ],
);

// ============================================================================
// DEVELOPER ACCOUNTS (developer.musiccloud.io self-service, MC-064)
// ============================================================================

/**
 * External developer accounts for the developer portal, kept entirely
 * separate from `adminUsers`. Backs the email/password auth flow
 * (signup, verification, login, password reset) and acts as the owning
 * entity for {@link developerIdentities} and {@link developerEmailTokens}.
 *
 * `passwordHash` is nullable to leave room for pure OAuth accounts added in
 * MC-065; an email/password account always carries a hash. `emailVerifiedAt`
 * gates login: it stays `null` until the verification token is consumed.
 */
export const developerAccounts = pgTable(
  "developer_accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    /** The name a person goes by, both halves optional and neither derived from the other. */
    firstName: text("first_name"),
    lastName: text("last_name"),
    /**
     * The picture an identity provider handed over, which today means GitHub.
     *
     * One of three sources a developer chooses between, and the only one they
     * cannot produce themselves.
     */
    avatarUrl: text("avatar_url"),
    /** A picture the developer uploaded, held as a `data:` URL like the dashboard's. */
    uploadedAvatarUrl: text("uploaded_avatar_url"),
    /** What Gravatar answered when it was last asked about this address. */
    gravatarUrl: text("gravatar_url"),
    /**
     * Which of the three is shown.
     *
     * Kept beside them rather than collapsing the three into one column, so
     * switching from an upload to a Gravatar and back does not throw the other
     * away. `null` means the portal picks whatever it has.
     */
    avatarSource: text("avatar_source"),
    /**
     * Where the operator writes when something about this account's
     * applications needs a person who can act, such as a shared engineering
     * address. Optional, and deliberately unverified: nothing is sent to it
     * that only the account holder may read, and the portal labels it as
     * unverified wherever it is shown.
     */
    technicalContactEmail: text("technical_contact_email"),
    /**
     * An address the developer has asked to sign in with, once they confirm it.
     *
     * Held here rather than on the token, so the profile page can say what is
     * pending and offer to cancel it. The account still signs in with `email`
     * until the confirmation link is followed.
     */
    pendingEmail: text("pending_email"),
    /** When that change was asked for, which is what the page dates. */
    pendingEmailRequestedAt: timestamp("pending_email_requested_at", { withTimezone: true }),
    /**
     * When an invitation admitted this account into the portal while it is
     * closed. `null` means no such access. It sits on the account rather than
     * in a cookie, so it holds on every device and is withdrawn in one place.
     */
    portalAccessGrantedAt: timestamp("portal_access_granted_at", { withTimezone: true }),
    tierId: text("tier_id").references(() => tiers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    check("chk_developer_accounts_status", sql`${table.status} IN (${sqlValueList(DEVELOPER_ACCOUNT_STATUSES)})`),
    check(
      "chk_developer_accounts_avatar_source",
      sql`${table.avatarSource} IS NULL OR ${table.avatarSource} IN ('provider', 'upload', 'gravatar')`,
    ),
  ],
);

export type DeveloperAccountRow = typeof developerAccounts.$inferSelect;
export type DeveloperAccountInsert = typeof developerAccounts.$inferInsert;

/**
 * Authentication identities linked to a {@link developerAccounts} row. Each
 * row records how an account can authenticate: `provider = 'email'` for the
 * built-in email/password path (with a `null` `providerUserId`), or
 * `provider = 'github'` for the OAuth path added in MC-065 (with the GitHub
 * user id in `providerUserId`).
 *
 * The first unique index keeps a single identity per provider per account;
 * the second prevents two accounts from claiming the same external provider
 * id. In Postgres, `NULL` values are distinct under a unique index, so
 * multiple `(github, NULL)` placeholders never collide.
 */
export const developerIdentities = pgTable(
  "developer_identities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_developer_identities_account_provider").on(table.accountId, table.provider),
    uniqueIndex("uq_developer_identities_provider_user").on(table.provider, table.providerUserId),
    check("chk_developer_identities_provider", sql`${table.provider} IN ('email', 'github')`),
  ],
);

export type DeveloperIdentityRow = typeof developerIdentities.$inferSelect;
export type DeveloperIdentityInsert = typeof developerIdentities.$inferInsert;

/**
 * Single-use, hashed email tokens for developer account verification and
 * password reset. The raw token is only ever sent in the email link; this
 * table stores the SHA-256 hash. A token is valid while `expiresAt` is in the
 * future and `consumedAt` is `null`; consuming it stamps `consumedAt` so it
 * cannot be replayed. Rows cascade-delete with their owning account.
 */
export const developerEmailTokens = pgTable(
  "developer_email_tokens",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_developer_email_tokens_token_hash").on(table.tokenHash),
    check("chk_developer_email_tokens_purpose", sql`${table.purpose} IN ('verify', 'reset', 'change-email')`),
  ],
);

/**
 * Invitations into the developer portal while it is closed.
 *
 * A table of its own rather than a purpose in `developer_email_tokens`,
 * because an invitation is sent to an address that may have no account yet,
 * and that table's `account_id` is required.
 *
 * Only the SHA-256 of the link's token is stored. An address has at most one
 * open invitation, which is what sending again rotates; one that was followed
 * or withdrawn leaves room for a new one. `account_id` names the account the
 * invitation's access ended up on, and is what withdrawing takes it back from.
 */
export const developerPortalInvitations = pgTable(
  "developer_portal_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByAdminId: text("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    accountId: text("account_id").references(() => developerAccounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_developer_portal_invitations_token_hash").on(table.tokenHash),
    uniqueIndex("uq_developer_portal_invitations_open_email")
      .on(table.email)
      .where(sql`${table.redeemedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    index("idx_developer_portal_invitations_account").on(table.accountId),
  ],
);

export type DeveloperEmailTokenRow = typeof developerEmailTokens.$inferSelect;
export type DeveloperEmailTokenInsert = typeof developerEmailTokens.$inferInsert;

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

/**
 * Sponsors' pictures, as copies musiccloud made and serves from its own
 * origin, so a visitor's browser never asks a sponsor's host for one.
 *
 * `id` is the SHA-256 of `png` as 64 lowercase hex digits: the same picture is
 * stored once, and its address never changes, so it is served with a cache
 * that never expires. `png` holds bytes the server re-encoded, never the bytes
 * a foreign host sent. A copy no sponsor points at is removed once it is older
 * than a day, which leaves a card that has not been saved yet time to save.
 */
export const sponsorAvatars = pgTable("sponsor_avatars", {
  id: text("id").primaryKey(),
  png: bytea("png").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SponsorAvatarRow = typeof sponsorAvatars.$inferSelect;

/**
 * Annual sponsors: the people who carry a year of the running costs.
 *
 * A sponsor's year runs from `paid_on`, so the sponsors on the site are the
 * rows whose year has not run out, and nothing is archived at a turn of the
 * year. What a sponsor gave is not a column here: it is summed from the
 * donations whose `sponsor_id` names them, because the ledger is the only
 * place a payment is recorded. The `links` column holds the profile addresses
 * in the order they were given, as a JSON array of `{ platform, url }`
 * entries, the shape `SocialMediaLinks` in `@musiccloud/shared` describes.
 * `published` records the sponsor's consent to be named and is `false` until
 * the operator records it.
 */
export const sponsors = pgTable(
  "sponsors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    socialMedia: jsonb("links").$type<SocialMediaLinks>().notNull().default([]),
    /** The sponsor's picture in {@link sponsorAvatars}, or `NULL` for the initial instead. */
    avatarId: text("avatar_id").references(() => sponsorAvatars.id, { onDelete: "set null" }),
    claim: text("claim").notNull().default(""),
    published: boolean("published").notNull().default(false),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_sponsors_paid_on").on(table.paidOn)],
);

export type SponsorRow = typeof sponsors.$inferSelect;
export type SponsorInsert = typeof sponsors.$inferInsert;

/**
 * The donations ledger: one row per payment that reached musiccloud, whatever
 * route it took. Every funding figure on the site and in the dashboard is a sum
 * over these rows, so the ledger is the only place a payment is recorded.
 *
 * `provider` and `currency` are held to the shared lists by check constraints,
 * so a row the application would never write cannot be written by hand either.
 * `external_ref` carries the bank's own reference for a payment the bank import
 * took in; its unique index is what keeps one transfer from being booked twice.
 * `received_on` is a calendar day, because a bank books a day rather than a
 * moment and the funding windows count days. `sponsor_id` links a payment to
 * the annual sponsor it belongs to; removing the sponsor sets it to `NULL`, so
 * the money stays in the ledger as a free donation.
 */
export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    /** Whether the donor agreed to be named on the site. The amount counts either way. */
    published: boolean("published").notNull().default(false),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default(DONATION_CURRENCY),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    provider: text("provider").notNull(),
    note: text("note").notNull().default(""),
    externalRef: text("external_ref"),
    sponsorId: text("sponsor_id").references(() => sponsors.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_donations_external_ref").on(table.externalRef),
    index("idx_donations_received_on").on(table.receivedOn),
    index("idx_donations_sponsor_id").on(table.sponsorId),
    check("chk_donations_amount", sql`${table.amountCents} > 0`),
    check("chk_donations_currency", sql`${table.currency} IN (${sqlValueList([DONATION_CURRENCY])})`),
    check("chk_donations_provider", sql`${table.provider} IN (${sqlValueList(DONATION_PROVIDERS)})`),
  ],
);

export type DonationRow = typeof donations.$inferSelect;
export type DonationInsert = typeof donations.$inferInsert;

/**
 * Sponsorship requests: what somebody said about themselves before paying for a
 * sponsorship, kept until an operator takes it over into {@link sponsors} and
 * {@link donations}, or until it expires after `PENDING_SPONSORSHIP_DAYS`.
 *
 * `reference` is the ISO 11649 creditor reference the transfer carries, stored
 * without spaces in upper case; its unique index keeps one row per reference
 * and is what a collision of two drawn references runs into. `links` holds the
 * one address the form took, already sorted into its platform, in the shape a
 * sponsor carries, so nothing has to be merged at the takeover. `amount_cents`
 * is what was announced; what arrived comes from the statement at the takeover.
 * `published` is the consent to be named, and `created_at` is when it was given
 * and when the request's lifetime starts.
 */
export const pendingSponsorships = pgTable(
  "pending_sponsorships",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    name: text("name").notNull(),
    socialMedia: jsonb("links").$type<SocialMediaLinks>().notNull().default([]),
    claim: text("claim").notNull(),
    amountCents: integer("amount_cents").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_pending_sponsorships_reference").on(table.reference),
    index("idx_pending_sponsorships_created_at").on(table.createdAt),
    check("chk_pending_sponsorships_amount", sql`${table.amountCents} >= 0`),
  ],
);

export type PendingSponsorshipRow = typeof pendingSponsorships.$inferSelect;
export type PendingSponsorshipInsert = typeof pendingSponsorships.$inferInsert;

/**
 * Every sponsorship reference whose request is gone from
 * {@link pendingSponsorships}, ported from lmaa.space's
 * `retired_sponsorship_references`.
 *
 * A request leaves when it is taken over, when it expires unclaimed and when an
 * operator removes it, and its reference must still be recognized afterwards: a
 * standing order keeps paying under it, and a payment can arrive after its
 * request expired. The bank import books a reference only where musiccloud
 * issued it, and an issued reference stands either in `pending_sponsorships` or
 * here. Every way a request leaves writes its reference here in the same
 * transaction.
 *
 * Only the reference is kept, upper case and without its printed spaces. It is
 * drawn at random and names nobody, so what the request said about the person
 * still goes when the request does. `retired_at` is when the request left.
 */
export const retiredSponsorshipReferences = pgTable("retired_sponsorship_references", {
  reference: text("reference").primaryKey(),
  retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One `retired_sponsorship_references` row as Drizzle reads it. */
export type RetiredSponsorshipReferenceRow = typeof retiredSponsorshipReferences.$inferSelect;

/**
 * Support prompts: the short asks that appear inside the site rather than on a
 * page of their own, ported from lmaa.space's `support_prompts`.
 *
 * The identifier is stable for the life of a prompt, because the counters in a
 * reader's browser are keyed by it. Renaming a prompt therefore resets nobody.
 * `slot` is one of `SUPPORT_PROMPT_SLOTS`, the places the site renders a prompt
 * in. `content` is Markdown, rendered through the same pipeline as a page.
 * `threshold` counts from how many, measured by `threshold_basis`, the prompt
 * may appear. `starts_at` and `ends_at` are an optional window as `YYYY-MM-DD`,
 * so a campaign switches itself on and off. `priority` decides between two
 * prompts that both qualify, higher wins. Unpublished prompts are not delivered
 * at all, not even to be hidden. The column defaults are the shared
 * `SUPPORT_PROMPT_DEFAULTS`, so a row written without a value starts where the
 * dashboard's new prompt does.
 */
export const supportPrompts = pgTable(
  "support_prompts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slot: text("slot").$type<SupportPromptSlot>().notNull(),
    content: text("content").notNull().default(SUPPORT_PROMPT_DEFAULTS.content),
    buttonLabel: text("button_label").notNull().default(SUPPORT_PROMPT_DEFAULTS.buttonLabel),
    buttonHref: text("button_href").notNull().default(SUPPORT_PROMPT_DEFAULTS.buttonHref),
    buttonAlignment: text("button_alignment")
      .$type<SupportPromptButtonAlignment>()
      .notNull()
      .default(SUPPORT_PROMPT_DEFAULTS.buttonAlignment),
    threshold: integer("threshold").notNull().default(SUPPORT_PROMPT_DEFAULTS.threshold),
    thresholdBasis: text("threshold_basis")
      .$type<SupportPromptThresholdBasis>()
      .notNull()
      .default(SUPPORT_PROMPT_DEFAULTS.thresholdBasis),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    priority: integer("priority").notNull().default(SUPPORT_PROMPT_DEFAULTS.priority),
    published: boolean("published").notNull().default(SUPPORT_PROMPT_DEFAULTS.published),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_support_prompts_slot").on(table.slot),
    check("chk_support_prompts_threshold", sql`${table.threshold} >= 0`),
  ],
);

/** One `support_prompts` row as Drizzle reads it. */
export type SupportPromptRow = typeof supportPrompts.$inferSelect;
/** One `support_prompts` row as Drizzle writes it, the defaulted columns optional. */
export type SupportPromptInsert = typeof supportPrompts.$inferInsert;

/**
 * The link to the bank account, as it stands and as it stood before, ported
 * from lmaa.space's `bank_connections`. musiccloud holds its own consent here
 * and shares no row with lmaa.space.
 *
 * A connection is a session at Enable Banking plus the one account that
 * session reaches. It lapses when the consent behind it expires, and renewing
 * it means walking the same authorization again, so a renewal writes a new row
 * and marks the old one revoked rather than overwriting it. That keeps it
 * answerable since when which connection was in force, which matters as soon
 * as a period shows no payments and somebody has to tell a quiet month from a
 * connection that had already lapsed.
 *
 * `session_id` is the credential that reaches the account, so it is never
 * logged and never served on a route. `consent_valid_until` is what the
 * provider stated on creation, `NULL` where it stated nothing. `revoked_at` is
 * `NULL` while the row is live. `consent_notice_stage` is the furthest warning
 * about this consent already sent, one of `BANK_CONSENT_NOTICE_STAGES`, `NULL`
 * until the first; a renewal starts a new row, which starts the warnings again.
 */
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    accountUid: text("account_uid").notNull(),
    aspspName: text("aspsp_name").notNull().default(""),
    aspspCountry: text("aspsp_country").notNull().default(""),
    consentValidUntil: timestamp("consent_valid_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    consentNoticeStage: text("consent_notice_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one live connection, enforced by the database rather than by the
    // service that writes it. The indexed expression is the same for every live
    // row and the index covers only those rows, so a second one cannot be
    // written even if two requests complete an authorization at once.
    uniqueIndex("uq_bank_connections_one_live")
      .on(sql`(${table.revokedAt} IS NULL)`)
      .where(sql`${table.revokedAt} IS NULL`),
    index("idx_bank_connections_created_at").on(table.createdAt),
    check(
      "chk_bank_connections_consent_notice_stage",
      sql`${table.consentNoticeStage} IS NULL OR ${table.consentNoticeStage} IN (${sqlValueList(BANK_CONSENT_NOTICE_STAGES)})`,
    ),
  ],
);

/** One `bank_connections` row as Drizzle reads it. */
export type BankConnectionRow = typeof bankConnections.$inferSelect;
/** One `bank_connections` row as Drizzle writes it, the defaulted columns optional. */
export type BankConnectionInsert = typeof bankConnections.$inferInsert;

/**
 * An authorization that has been started and not yet come back, ported from
 * lmaa.space's `bank_authorization_states`.
 *
 * The bank returns the person to the dashboard carrying a code and the value
 * this row holds. Recognizing that value is what says the return belongs to an
 * authorization this site started, so the row is removed as it is recognized
 * and a second return with the same value finds nothing. `state` is 32 random
 * bytes as hex, 256 bits in 64 characters. `authorization_id` is what Enable
 * Banking called the authorization, kept for the log, empty where it named
 * none. After `expires_at` the row no longer counts, whether or not it is
 * still there.
 */
export const bankAuthorizationStates = pgTable(
  "bank_authorization_states",
  {
    state: text("state").primaryKey(),
    authorizationId: text("authorization_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_bank_authorization_states_expires_at").on(table.expiresAt)],
);

/** One `bank_authorization_states` row as Drizzle reads it. */
export type BankAuthorizationStateRow = typeof bankAuthorizationStates.$inferSelect;

/**
 * Every time the backend read the bank account, and what came of it, ported
 * from lmaa.space's `bank_account_reads`.
 *
 * Two questions are answered from this table. How many background reads
 * happened in the sliding 24 hours, which Article 36(5) of Commission Delegated
 * Regulation (EU) 2018/389 caps at four while nobody is asking, and whether a
 * read has ever finished, which tells the first read (90 days back) from every
 * later one (5 days back). A stored row is what makes both survive a restart; a
 * timer does not, because a deployment starts it again and two containers
 * briefly run one each.
 *
 * `kind` is one of `BANK_READ_KINDS`, counted apart because the owner asking
 * is not capped and must not lock the background run out. `succeeded` is
 * `false` until the read finished. `booked_through` is the last day a finished
 * read covered, `YYYY-MM-DD`, and `NULL` while a read is in flight and on one
 * that failed. `failure_reason` is the `MC-BANK-*` code a failed read broke off
 * with, `NULL` otherwise. The four counts are how many entries came back, how
 * many became a ledger row, how many stood there and were completed, and how
 * many stood there unchanged; they hold counts and nothing about any entry.
 */
export const bankAccountReads = pgTable(
  "bank_account_reads",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    succeeded: boolean("succeeded").notNull().default(false),
    bookedThrough: text("booked_through"),
    failureReason: text("failure_reason"),
    transactionsRead: integer("transactions_read").notNull().default(0),
    imported: integer("imported").notNull().default(0),
    filled: integer("filled").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
  },
  (table) => [
    index("idx_bank_account_reads_read_at").on(table.readAt),
    check("chk_bank_account_reads_kind", sql`${table.kind} IN (${sqlValueList(BANK_READ_KINDS)})`),
  ],
);

/** One `bank_account_reads` row as Drizzle reads it. */
export type BankAccountReadRow = typeof bankAccountReads.$inferSelect;

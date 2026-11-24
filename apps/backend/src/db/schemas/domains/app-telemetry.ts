import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { bytea } from "./column-types.js";

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

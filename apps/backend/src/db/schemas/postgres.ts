/**
 * The Drizzle schema of the Postgres database, one file per domain under `domains/`.
 *
 * `drizzle.config.postgres.ts` and every importer read the schema from this file, so it
 * re-exports every table of every domain. `domains/column-types.ts` holds column helpers
 * and no tables, so it is not re-exported.
 */

import { BANK_CONSENT_NOTICE_STAGES, BANK_READ_KINDS } from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sqlValueList } from "./domains/column-types.js";

export * from "./domains/admin-users.js";
export * from "./domains/album-catalog.js";
export * from "./domains/app-telemetry.js";
export * from "./domains/artist-cache.js";
export * from "./domains/artist-credits.js";
export * from "./domains/artist-identity.js";
export * from "./domains/artist-profiles.js";
export * from "./domains/billing.js";
export * from "./domains/content-navigation.js";
export * from "./domains/crawl.js";
export * from "./domains/creative-commons.js";
export * from "./domains/developer-accounts.js";
export * from "./domains/email.js";
export * from "./domains/media-caches.js";
export * from "./domains/site-settings.js";
export * from "./domains/sponsoring.js";
export * from "./domains/track-catalog.js";
export * from "./domains/vinyl-layouts.js";

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

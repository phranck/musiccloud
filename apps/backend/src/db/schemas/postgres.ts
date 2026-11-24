/**
 * The Drizzle schema of the Postgres database, one file per domain under `domains/`.
 *
 * `drizzle.config.postgres.ts` and every importer read the schema from this file, so it
 * re-exports every table of every domain. `domains/column-types.ts` holds column helpers
 * and no tables, so it is not re-exported.
 */

import {
  BANK_CONSENT_NOTICE_STAGES,
  BANK_READ_KINDS,
  DONATION_CURRENCY,
  DONATION_PROVIDERS,
  type SocialMediaLinks,
  SUPPORT_PROMPT_DEFAULTS,
  type SupportPromptButtonAlignment,
  type SupportPromptSlot,
  type SupportPromptThresholdBasis,
} from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bytea, sqlValueList } from "./domains/column-types.js";

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
export * from "./domains/track-catalog.js";
export * from "./domains/vinyl-layouts.js";

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

import {
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
import { bytea, sqlValueList } from "./column-types.js";

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

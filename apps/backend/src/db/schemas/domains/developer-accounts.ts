import { DEVELOPER_ACCOUNT_STATUSES } from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { adminUsers } from "./admin-users.js";
import { tiers } from "./billing.js";
import { sqlValueList } from "./column-types.js";

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

import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { bytea } from "./column-types.js";

// Managed email templates. Created and edited via the dashboard email
// template editor; rendered to HTML by services/email-renderer.ts.
/**
 * Managed email templates edited through the dashboard.
 *
 * Stores the block-based body (`blocks`), subject, and a system-template flag
 * for protected built-in templates. A template's expected `{{var}}` variables
 * are auto-extracted from its subject + body at use time (MC-080), not stored.
 * The nine trailing branding columns are per-template overrides
 * (MC-079): each is nullable, and `NULL` means that the template has no override
 * and inherits the corresponding {@link emailBranding} global default for this render. A
 * non-null value wins over the global default for that one field only (merge
 * logic lives in `email-renderer.ts`'s `resolveBranding`).
 */
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull().default(""),
  isSystemTemplate: boolean("is_system_template").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  blocks: jsonb("blocks").notNull().default([]),
  // Per-template branding overrides (MC-079). All nullable: NULL = inherit the
  // matching global emailBranding default for this field.
  headerAssetId: text("header_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerText: text("footer_text"),
  lightBackgroundAssetId: text("light_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  darkBackgroundAssetId: text("dark_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  lightGradientTop: text("light_gradient_top"),
  lightGradientBottom: text("light_gradient_bottom"),
  darkGradientTop: text("dark_gradient_top"),
  darkGradientBottom: text("dark_gradient_bottom"),
});

export type EmailTemplateRow = typeof emailTemplates.$inferSelect;
export type EmailTemplateInsert = typeof emailTemplates.$inferInsert;

/**
 * Global email branding (MC-078, extended MC-079): a single row carrying the
 * default header/footer assets, footer text, and day/night page background
 * (gradient + optional image) applied to every rendered template UNLESS the
 * template overrides the matching field (see {@link emailTemplates}). The app
 * always reads/writes the lowest-id row; the migration seeds exactly one.
 *
 * The four gradient columns are NOT NULL with the real website night-sky
 * shader defaults (`apps/frontend/src/components/background/nightSky/settings.ts`):
 * a gradient always needs two colours to render, so there is no nullable
 * fallback chain here. A fresh setup already looks coherent without any admin
 * action. The two background-image asset ids stay nullable (no image until the
 * user uploads one; the gradient alone renders in the meantime).
 */
export const emailBranding = pgTable("email_branding", {
  id: serial("id").primaryKey(),
  headerAssetId: text("header_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerText: text("footer_text"),
  lightBackgroundAssetId: text("light_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  darkBackgroundAssetId: text("dark_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  lightGradientTop: text("light_gradient_top").notNull().default("#0076d5"),
  lightGradientBottom: text("light_gradient_bottom").notNull().default("#69d1fd"),
  darkGradientTop: text("dark_gradient_top").notNull().default("#0b1318"),
  darkGradientBottom: text("dark_gradient_bottom").notNull().default("#10273b"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailBrandingRow = typeof emailBranding.$inferSelect;
export type EmailBrandingInsert = typeof emailBranding.$inferInsert;

/**
 * Binary email images (MC-078). Mirrors `genreArtworks`: bytes live in
 * Postgres, served by `GET /api/admin/email-assets/:id` with a long immutable
 * cache. Referenced by {@link emailBranding} and by `image` body-blocks.
 */
export const emailAssets = pgTable("email_assets", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailAssetRow = typeof emailAssets.$inferSelect;
export type EmailAssetInsert = typeof emailAssets.$inferInsert;

/**
 * Binds a system action (code-defined, see `@musiccloud/shared` EMAIL_ACTIONS)
 * to a template (MC-078). Many-to-many: one action fans out to every enabled
 * binding's template; a template may be bound to several actions.
 */
export const emailActionBindings = pgTable(
  "email_action_bindings",
  {
    id: text("id").primaryKey(),
    actionKey: text("action_key").notNull(),
    templateId: integer("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_email_action_bindings_action_template").on(table.actionKey, table.templateId),
    index("idx_email_action_bindings_action").on(table.actionKey),
  ],
);

export type EmailActionBindingRow = typeof emailActionBindings.$inferSelect;
export type EmailActionBindingInsert = typeof emailActionBindings.$inferInsert;

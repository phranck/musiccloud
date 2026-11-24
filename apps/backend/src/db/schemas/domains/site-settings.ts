import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adminUsers } from "./admin-users.js";

// Site-wide settings (key/value store)
/**
 * Site-wide key/value settings edited through the dashboard.
 * The key is the natural primary key and values are stored as serialized text.
 */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * One row per change of the developer portal's availability.
 *
 * The two `site_settings` rows behind the portal gate hold only the current
 * state, so without this table nothing says when the portal was opened or by
 * whom. A row holds the state the owner set, not the state before it, because
 * the previous row already says that. A write that changes nothing adds no row.
 */
export const developerPortalAvailabilityEvents = pgTable(
  "developer_portal_availability_events",
  {
    id: text("id").primaryKey(),
    actorAdminId: text("actor_admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "restrict" }),
    public: boolean("public").notNull(),
    maintenance: boolean("maintenance").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_developer_portal_availability_events_occurred").on(table.occurredAt.desc())],
);

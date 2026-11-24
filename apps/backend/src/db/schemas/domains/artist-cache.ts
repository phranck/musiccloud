import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adminUsers } from "./admin-users.js";
import { artistEntities } from "./artist-identity.js";

// Artist cache for caching artist info from external services
/**
 * Cached artist-info payloads from external enrichment services.
 * Stores JSON profile, top-track and event payloads with independent freshness
 * timestamps for lazy refreshes.
 */
export const artistCache = pgTable(
  "artist_cache",
  {
    id: text("id").primaryKey(),
    artistName: text("artist_name").notNull(),
    profile: text("profile"), // JSON
    profileProviders: text("profile_providers").array().notNull().default(sql`ARRAY[]::text[]`),
    topTracks: text("top_tracks"), // JSON
    events: text("events"), // JSON
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
    tracksUpdatedAt: timestamp("tracks_updated_at", { withTimezone: true }),
    eventsUpdatedAt: timestamp("events_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_artist_cache_updated_at").on(table.updatedAt)],
);

/**
 * Audit trail for explicit Dashboard-triggered artist profile refreshes.
 * Stores only safe canonical error metadata and a short redacted cause; raw
 * upstream responses and credentials never belong in this relation.
 */
export const artistProfileRefreshEvents = pgTable(
  "artist_profile_refresh_events",
  {
    id: text("id").primaryKey(),
    actorAdminId: text("actor_admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "restrict" }),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "restrict" }),
    trigger: text("trigger").notNull().default("manual"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: text("outcome").notNull(),
    errorCode: text("error_code"),
    errorId: text("error_id"),
    cause: text("cause"),
  },
  (table) => [
    index("idx_artist_profile_refresh_events_entity_occurred").on(table.artistEntityId, table.occurredAt.desc()),
    index("idx_artist_profile_refresh_events_actor_occurred").on(table.actorAdminId, table.occurredAt.desc()),
    check("chk_artist_profile_refresh_events_trigger", sql`${table.trigger} IN ('manual')`),
    check("chk_artist_profile_refresh_events_outcome", sql`${table.outcome} IN ('refreshing', 'succeeded', 'failed')`),
  ],
);

export type ArtistProfileRefreshEventRow = typeof artistProfileRefreshEvents.$inferSelect;
export type ArtistProfileRefreshEventInsert = typeof artistProfileRefreshEvents.$inferInsert;

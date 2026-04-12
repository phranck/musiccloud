import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// User-scoped conversion history.
// user_id references auth.users(id) — the FK constraint with ON DELETE CASCADE
// is added in migration 0001_rls_and_realtime.sql because drizzle-kit does not
// model cross-schema references to Supabase's internal `auth` schema.
export const mediaEntries = pgTable(
  "media_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    originalUrl: text("original_url").notNull(),
    shortUrl: text("short_url").notNull(),
    mediaType: text("media_type").notNull(),
    track: jsonb("track"),
    album: jsonb("album"),
    artist: jsonb("artist"),
    serviceLinks: jsonb("service_links").notNull().default(sql`'[]'::jsonb`),
    artworkUrl: text("artwork_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("media_type_valid", sql`${table.mediaType} IN ('track', 'album', 'artist')`),
    index("idx_media_entries_user_date").on(table.userId, table.createdAt.desc()),
    uniqueIndex("idx_media_entries_user_original_url").on(table.userId, table.originalUrl),
  ],
);

// Globally-shared enriched artist data, written exclusively by the Fastify
// enrichment worker (service_role key). Clients read via RLS policy + Realtime.
export const enrichedArtists = pgTable(
  "enriched_artists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    genres: jsonb("genres"),
    bio: text("bio"),
    followerCount: integer("follower_count"),
    topTracks: jsonb("top_tracks"),
    upcomingEvents: jsonb("upcoming_events"),
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
    tracksUpdatedAt: timestamp("tracks_updated_at", { withTimezone: true }),
    eventsUpdatedAt: timestamp("events_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_enriched_artists_name").on(table.name),
    index("idx_enriched_artists_stale").on(table.profileUpdatedAt.asc().nullsFirst()),
  ],
);

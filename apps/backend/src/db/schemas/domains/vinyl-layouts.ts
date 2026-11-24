import type { VinylLayout } from "@musiccloud/shared";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Discogs vinyl layout cache, keyed by artist-qualified album identity.
 *
 * The layout describes how a record is pressed, so its sides, the track
 * positions on them and their durations. The turntable renders the per-track
 * groove rings from it.
 *
 * - **Positive cache:** `layout_data` holds a {@link VinylLayout} object, and
 *   `discogs_release_id` records which Discogs release it came from.
 * - **Negative cache:** `layout_data` is `null`, meaning Discogs was asked and
 *   holds no suitable vinyl pressing. That stops the lookup repeating.
 *
 * The key is the identity in the form `artist::title` rather than an album id.
 * A layout belongs to a pressing, which many tracks and albums share, and most
 * tracks that need one have no catalogue album. Keying it by album forced a
 * placeholder album into existence for every such track, and left the album
 * share page unable to reach a cache entry owned by a different row.
 */
export const vinylLayouts = pgTable("vinyl_layouts", {
  identityKey: text("identity_key").primaryKey(),
  discogsReleaseId: text("discogs_release_id"),
  layoutData: jsonb("layout_data").$type<VinylLayout>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

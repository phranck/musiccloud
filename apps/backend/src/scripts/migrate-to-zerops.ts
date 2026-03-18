import pg from "pg";
import fs from "fs";
import { nanoid } from "nanoid";

const data = JSON.parse(fs.readFileSync("/tmp/migration_data.json", "utf-8"));
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || "postgresql://db:REDACTED@postgresql:5432",
});

const toDate = (ms: number | null) => (ms && ms > 0 ? new Date(ms * 1000) : new Date());

async function insertTable(tableName: string, rows: any[], mapping: Record<string, string>) {
  if (!rows || rows.length === 0) {
    console.log(`  ${tableName}: 0 rows`);
    return;
  }

  let inserted = 0;
  for (const row of rows) {
    try {
      const cols = Object.keys(mapping);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const values = cols.map((col) => {
        const val = row[col];
        if ((col.endsWith("_at") || col.endsWith("_updated_at")) && typeof val === "number") {
          return toDate(val);
        }
        return val;
      });

      const sql = `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`;
      await client.query(sql, values);
      inserted++;
    } catch (error: any) {
      console.error(`  Error on ${tableName}:`, error.message);
      console.error("  Row:", row);
      throw error;
    }
  }
  console.log(`  ${tableName}: ${inserted} rows ✓`);
}

async function migrate() {
  try {
    await client.connect();
    console.log("Connected to Zerops PostgreSQL\n");

    await client.query("BEGIN");

    // TRACKS
    await insertTable("tracks", data.tracks, {
      id: "id",
      title: "title",
      artists: "artists",
      album_name: "album_name",
      isrc: "isrc",
      artwork_url: "artwork_url",
      duration_ms: "duration_ms",
      release_date: "release_date",
      is_explicit: "is_explicit",
      preview_url: "preview_url",
      source_service: "source_service",
      source_url: "source_url",
      created_at: "created_at",
      updated_at: "updated_at",
    });

    // SERVICE_LINKS
    await insertTable("service_links", data.service_links, {
      id: "id",
      track_id: "track_id",
      service: "service",
      external_id: "external_id",
      url: "url",
      confidence: "confidence",
      match_method: "match_method",
      created_at: "created_at",
    });

    // SHORT_URLS
    await insertTable("short_urls", data.short_urls, {
      id: "id",
      track_id: "track_id",
      created_at: "created_at",
    });

    // ALBUMS
    await insertTable("albums", data.albums, {
      id: "id",
      title: "title",
      artists: "artists",
      release_date: "release_date",
      total_tracks: "total_tracks",
      artwork_url: "artwork_url",
      label: "label",
      upc: "upc",
      source_service: "source_service",
      source_url: "source_url",
      preview_url: "preview_url",
      created_at: "created_at",
      updated_at: "updated_at",
    });

    // ALBUM_SERVICE_LINKS
    await insertTable("album_service_links", data.album_service_links, {
      id: "id",
      album_id: "album_id",
      service: "service",
      external_id: "external_id",
      url: "url",
      confidence: "confidence",
      match_method: "match_method",
      created_at: "created_at",
    });

    // ALBUM_SHORT_URLS
    await insertTable("album_short_urls", data.album_short_urls, {
      id: "id",
      album_id: "album_id",
      created_at: "created_at",
    });

    // ARTIST_CACHE (fields have different names, generate IDs)
    const artistCacheRows = data.artist_cache.map((row: any) => {
      // Generate created_at and updated_at from the update timestamps
      const timestamps = [
        row.profile_updated_at,
        row.tracks_updated_at,
        row.events_updated_at,
      ].filter((t: any) => typeof t === "number" && t > 0);
      const created_at = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() / 1000;
      const updated_at = timestamps.length > 0 ? Math.max(...timestamps) : Date.now() / 1000;

      return {
        ...row,
        id: `artist-${nanoid()}`,
        profile: row.artist_profile_json,
        top_tracks: row.top_tracks_json,
        events: row.events_json,
        created_at,
        updated_at,
      };
    });
    await insertTable("artist_cache", artistCacheRows, {
      id: "id",
      artist_name: "artist_name",
      profile: "profile",
      top_tracks: "top_tracks",
      events: "events",
      profile_updated_at: "profile_updated_at",
      tracks_updated_at: "tracks_updated_at",
      events_updated_at: "events_updated_at",
      created_at: "created_at",
      updated_at: "updated_at",
    });

    // URL_ALIASES (skip rows without short_id)
    const urlAliasesRows = data.url_aliases
      .filter((row: any) => row.short_id)
      .map((row: any) => ({
        ...row,
        id: row.id || `alias-${nanoid()}`,
      }));
    await insertTable("url_aliases", urlAliasesRows, {
      id: "id",
      short_id: "short_id",
      track_id: "track_id",
      created_at: "created_at",
    });

    // ADMIN_USERS
    await insertTable("admin_users", data.admin_users, {
      id: "id",
      username: "username",
      password_hash: "password_hash",
      created_at: "created_at",
      last_login_at: "last_login_at",
    });

    await client.query("COMMIT");
    console.log("\n✅ Migration completed successfully!");
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

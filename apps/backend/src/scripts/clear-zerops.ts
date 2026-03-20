import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

async function clear() {
  try {
    await client.connect();
    console.log("Connected to Zerops PostgreSQL");

    const tables = [
      "url_aliases",
      "artist_cache",
      "featured_albums",
      "featured_tracks",
      "album_short_urls",
      "album_service_links",
      "short_urls",
      "service_links",
      "albums",
      "tracks",
      "admin_users"
    ];

    for (const table of tables) {
      await client.query(`DELETE FROM ${table}`);
      console.log(`✓ Cleared ${table}`);
    }

    console.log("\n✅ All tables cleared");
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

clear();

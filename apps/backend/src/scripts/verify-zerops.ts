import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

async function verify() {
  try {
    await client.connect();
    console.log("✅ Connected to Zerops PostgreSQL\n");

    const tables = [
      "admin_users",
      "tracks",
      "albums",
      "artist_cache",
      "service_links",
      "short_urls",
    ];

    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result.rows[0].count;
      console.log(`${table}: ${count} rows`);
    }

    // Sample data
    console.log("\n--- Sample Track ---");
    const track = await client.query(`
      SELECT id, title, artists FROM tracks LIMIT 1
    `);
    if (track.rows.length > 0) {
      console.log(track.rows[0]);
    }

    console.log("\n--- Admin Users ---");
    const admins = await client.query(`
      SELECT id, username FROM admin_users
    `);
    admins.rows.forEach((row: Record<string, unknown>) => {
      console.log(`  ${row.username} (${row.id})`);
    });

    console.log("\n✅ Verification complete!");
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

verify();

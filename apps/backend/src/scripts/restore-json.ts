import pg from "pg";
import fs from "fs";

const data = JSON.parse(fs.readFileSync("/tmp/musiccloud-backup.json", "utf-8"));
const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

const toDate = (val: any) => {
  if (typeof val === "string") return new Date(val);
  if (typeof val === "number") return new Date(val * 1000);
  return val;
};

async function insertTable(tableName: string, rows: any[], columns: string[]) {
  if (!rows || rows.length === 0) {
    console.log(`  ${tableName}: 0 rows`);
    return;
  }

  let inserted = 0;
  for (const row of rows) {
    try {
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const values = columns.map((col) => {
        const val = row[col];
        if ((col.endsWith("_at")) && typeof val === "string") {
          return toDate(val);
        }
        return val;
      });

      const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
      await client.query(sql, values);
      inserted++;
    } catch (error: any) {
      console.error(`  Error on ${tableName}:`, error.message);
      throw error;
    }
  }
  console.log(`  ${tableName}: ${inserted} rows ✓`);
}

async function restore() {
  try {
    await client.connect();
    console.log("Connected to Zerops PostgreSQL\n");

    await client.query("BEGIN");

    // Insert in order of dependencies
    const order = [
      "admin_users",
      "tracks",
      "albums",
      "artist_cache",
      "service_links",
      "short_urls",
      "album_service_links",
      "album_short_urls",
      "featured_tracks",
      "featured_albums",
      "url_aliases"
    ];

    for (const tableName of order) {
      const rows = data[tableName];
      if (rows && Array.isArray(rows) && rows.length > 0) {
        const columns = Object.keys(rows[0]);
        await insertTable(tableName, rows as any[], columns);
      } else {
        console.log(`  ${tableName}: 0 rows`);
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Restore completed successfully!");
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("\n❌ Restore failed:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

restore();

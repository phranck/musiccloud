import pg from "pg";
import fs from "fs";

const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

async function restore() {
  try {
    await client.connect();
    console.log("✅ Connected to Zerops PostgreSQL");

    const dump = fs.readFileSync("/tmp/musiccloud-dump.sql", "utf-8");
    
    console.log("🔄 Restoring database...");
    await client.query(dump);
    
    console.log("✅ Restore completed successfully!");
    
    // Verify
    const tables = await client.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
    const tracks = await client.query("SELECT COUNT(*) as count FROM tracks");
    const users = await client.query("SELECT COUNT(*) as count FROM admin_users");
    
    console.log(`\nTables: ${tables.rows[0].count}`);
    console.log(`Tracks: ${tracks.rows[0].count}`);
    console.log(`Admin Users: ${users.rows[0].count}`);
  } catch (error: unknown) {
    console.error("❌ Restore failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

restore();

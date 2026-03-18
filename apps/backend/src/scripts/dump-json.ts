import pg from "pg";
import fs from "fs";

const sourceClient = new pg.Client({
  connectionString: "postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud",
});

async function dumpDatabase() {
  try {
    await sourceClient.connect();
    console.log("✅ Connected to local PostgreSQL");

    // Get all tables
    const tables = await sourceClient.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const data: Record<string, any[]> = {};

    for (const table of tables.rows) {
      const tableName = table.tablename;
      console.log(`Reading ${tableName}...`);

      const rows = await sourceClient.query(`SELECT * FROM ${tableName}`);
      data[tableName] = rows.rows;
    }

    fs.writeFileSync("/tmp/musiccloud-backup.json", JSON.stringify(data, null, 2));
    
    const counts = Object.entries(data).map(([t, r]) => `${t}: ${r.length}`).join(", ");
    console.log(`\n✅ Backup saved (${counts})`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await sourceClient.end();
  }
}

dumpDatabase();

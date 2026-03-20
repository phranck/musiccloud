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

    let dump = "-- musiccloud database dump\n\n";

    for (const table of tables.rows) {
      const tableName = table.tablename;
      console.log(`Dumping ${tableName}...`);

      // Get column info
      const columns = await sourceClient.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const cols = columns.rows.map(r => r.column_name).join(", ");

      // Get data
      const rows = await sourceClient.query(`SELECT * FROM ${tableName}`);

      if (rows.rows.length > 0) {
        dump += `\nDELETE FROM ${tableName};\n`;
        dump += `INSERT INTO ${tableName} (${cols}) VALUES\n`;

        const values = rows.rows.map(row => {
          const vals = columns.rows.map(col => {
            const val = row[col.column_name];
            if (val === null) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          }).join(", ");
          return `(${vals})`;
        }).join(",\n");

        dump += values + ";\n";
      }
    }

    fs.writeFileSync("/tmp/musiccloud-dump.sql", dump);
    console.log(`\n✅ Dump saved to /tmp/musiccloud-dump.sql (${(dump.length / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await sourceClient.end();
  }
}

dumpDatabase();

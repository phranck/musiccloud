import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

client.connect()
  .then(() => {
    console.log("✅ Connected to Zerops PostgreSQL");
    return client.query("SELECT version()");
  })
  .then(res => {
    console.log("PostgreSQL Version:", res.rows[0].version.split(",")[0]);
    return client.end();
  })
  .catch((err: any) => {
    console.error("❌ Connection failed:", err.message);
    process.exit(1);
  });

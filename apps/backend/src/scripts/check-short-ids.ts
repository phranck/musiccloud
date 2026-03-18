import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://db:REDACTED@postgresql:5432",
});

async function check() {
  try {
    await client.connect();
    console.log("✅ Connected to Zerops PostgreSQL\n");

    // Get all short URLs
    const result = await client.query(`
      SELECT su.id as short_id, t.id as track_id, t.title, t.artists
      FROM short_urls su
      JOIN tracks t ON su.track_id = t.id
      LIMIT 10
    `);

    console.log("Short URLs in DB:");
    result.rows.forEach((row: any) => {
      console.log(`  ${row.short_id} -> ${row.title} by ${row.artists}`);
    });

    console.log(`\nLooking for Lrgzm specifically...`);
    const lrgzm = await client.query(`
      SELECT su.id as short_id, t.id as track_id, t.title
      FROM short_urls su
      JOIN tracks t ON su.track_id = t.id
      WHERE su.id = 'Lrgzm'
    `);

    if (lrgzm.rows.length > 0) {
      console.log(`✅ Found: ${JSON.stringify(lrgzm.rows[0])}`);
    } else {
      console.log(`❌ Lrgzm not found!`);
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

check();

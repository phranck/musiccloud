import { getRepository } from "../db/index.js";

async function test() {
  const repo = await getRepository();
  
  try {
    // Test: Text search
    const results = await repo.findTracksByTextSearch("friday love cure");
    console.log("✅ Text search works!");
    console.log(`Found ${results.length} results`);
    if (results.length > 0) {
      console.log("\nFirst result:");
      console.log(JSON.stringify(results[0], null, 2));
    }
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) console.error(error.stack);
  }
}

test();

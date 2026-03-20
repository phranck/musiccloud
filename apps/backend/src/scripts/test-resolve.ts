import { getRepository } from "../db/index.js";

async function test() {
  const repo = await getRepository();
  
  try {
    // Test: einen Track direkt laden
    const track = await repo.findTrackByIsrc("USRC17607839");
    console.log("✅ findTrackByIsrc works:");
    console.log(track);
    
    // Test: Text search
    const results = await repo.findTracksByTextSearch("cure");
    console.log("\n✅ findTracksByTextSearch works:");
    console.log(`Found ${results.length} results`);
    if (results.length > 0) {
      console.log(results[0]);
    }
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) console.error(error.stack);
  }
}

test();

import { getRepository } from "../db/index.js";

async function test() {
  const repo = await getRepository();
  
  try {
    console.log("Testing listTracks...");
    const result1 = await repo.listTracks({ page: 1, limit: 5 });
    console.log(`✅ listTracks (no search): ${result1.items.length} items, total: ${result1.total}`);
    
    console.log("\nTesting listTracks with search...");
    const result2 = await repo.listTracks({ page: 1, limit: 5, q: "cure" });
    console.log(`✅ listTracks (with search): ${result2.items.length} items, total: ${result2.total}`);
    
    console.log("\nTesting listAlbums...");
    const result3 = await repo.listAlbums({ page: 1, limit: 5 });
    console.log(`✅ listAlbums: ${result3.items.length} items, total: ${result3.total}`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  }
}

test();

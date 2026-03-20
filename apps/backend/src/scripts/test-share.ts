import { getRepository } from "../db/index.js";

async function test() {
  const repo = await getRepository();
  
  try {
    // Get first short URL
    const result = await repo.loadByShortId("Lrgzm");
    console.log("✅ Share lookup works!");
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
  }
}

test();

import { getRepository } from "../db/index.js";

// Simulate the full share page data flow
async function test() {
  const repo = await getRepository();
  
  console.log("1. Testing loadByShortId('Lrgzm')...");
  const cached = await repo.loadByShortId("Lrgzm");
  
  if (!cached) {
    console.error("❌ loadByShortId returned null");
    return;
  }
  
  console.log("✅ loadByShortId returned data:");
  console.log(`   Track: ${cached.track.title}`);
  console.log(`   Artists: ${cached.track.artists}`);
  console.log(`   Links: ${cached.links.length}`);
  console.log(`   Short ID: ${cached.shortId}`);
  console.log(`   Updated: ${new Date(cached.updatedAt)}`);
}

test();

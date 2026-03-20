import { getRepository } from "../db/index.js";
import { loadByShortId } from "../lib/server/share-page.js";

async function test() {
  try {
    console.log("Testing loadByShortId...");
    const data = await loadByShortId("Lrgzm", "https://musiccloud.io");
    
    if (data) {
      console.log("✅ loadByShortId works!");
      console.log(`Track: ${data.track.title}`);
      console.log(`Links: ${data.links.length}`);
    } else {
      console.log("❌ loadByShortId returned null");
    }
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) console.error(error.stack);
  }
}

test();

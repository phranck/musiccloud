import { getRepository } from "../db/index.js";
import { loadByShortId } from "../lib/server/share-page.js";

async function test() {
  try {
    console.log("Testing loadByShortId with origin...");
    const data = await loadByShortId("Lrgzm", "https://musiccloud.io");
    
    if (data) {
      console.log("✅ Share data loaded!");
      console.log(`Track: ${data.track.title}`);
      console.log(`Artists: ${data.artists}`);
      console.log(`OG URL: ${data.og.ogUrl}`);
      console.log(`OG Title: ${data.og.ogTitle}`);
      console.log(`Links: ${data.links.length}`);
    } else {
      console.log("❌ loadByShortId returned null");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  }
}

test();

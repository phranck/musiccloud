import { getRepository } from "../db/index.js";

async function test() {
  const repo = await getRepository();
  
  try {
    const result = await repo.persistTrackWithLinks({
      sourceTrack: {
        title: "Test Track",
        artists: ["Test Artist"],
        albumName: "Test Album",
        isrc: "TEST123456",
        artworkUrl: "https://example.com/art.jpg",
        durationMs: 180000,
        releaseDate: "2024-01-01",
        isExplicit: false,
        previewUrl: "https://example.com/preview.mp3",
        sourceService: "spotify",
        sourceUrl: "https://open.spotify.com/track/test",
      },
      links: [
        {
          service: "spotify",
          url: "https://open.spotify.com/track/test",
          confidence: 1.0,
          matchMethod: "isrc",
          externalId: "123",
        },
      ],
    });
    
    console.log("✅ persistTrackWithLinks works!");
    console.log(result);
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) console.error(error.stack);
  }
}

test();

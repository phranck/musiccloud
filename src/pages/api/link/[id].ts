import type { APIRoute } from "astro";
import { db } from "../../../db/index.js";
import { tracks, serviceLinks } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "INVALID_URL", message: "Track ID is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const track = db.select().from(tracks).where(eq(tracks.id, id)).get();

  if (!track) {
    return new Response(
      JSON.stringify({ error: "TRACK_NOT_FOUND", message: "Track not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const links = db
    .select()
    .from(serviceLinks)
    .where(eq(serviceLinks.trackId, id))
    .all();

  return new Response(
    JSON.stringify({
      id: track.id,
      track: {
        title: track.title,
        artists: JSON.parse(track.artists),
        albumName: track.albumName,
        artworkUrl: track.artworkUrl,
        durationMs: track.durationMs,
        isrc: track.isrc,
      },
      links: links.map((l) => ({
        service: l.service,
        url: l.url,
        confidence: l.confidence,
        matchMethod: l.matchMethod,
      })),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
};

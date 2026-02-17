import type { APIRoute } from "astro";
import { getRepository } from "../../../db/index.js";
import { apiRateLimiter } from "../../../lib/rate-limiter.js";

export const prerender = false;

export const GET: APIRoute = async ({ params, clientAddress }) => {
  const clientIp = clientAddress ?? "unknown";
  if (apiRateLimiter.isLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "RATE_LIMITED", message: "Too many requests. Please try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id } = params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "INVALID_URL", message: "Track ID is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const repo = await getRepository();
  const data = await repo.loadByTrackId(id);

  if (!data) {
    return new Response(
      JSON.stringify({ error: "TRACK_NOT_FOUND", message: "Track not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      id,
      track: {
        title: data.track.title,
        artists: data.artists,
        albumName: data.track.albumName,
        artworkUrl: data.track.artworkUrl,
      },
      links: data.links.map((l) => ({
        service: l.service,
        url: l.url,
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

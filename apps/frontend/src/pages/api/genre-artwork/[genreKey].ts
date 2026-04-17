import type { APIRoute } from "astro";
import { fetchGenreArtwork } from "@/api/client";

export const prerender = false;

/**
 * Astro proxy for backend `/api/v1/genre-artwork/:genreKey`. Streams the
 * JPEG binary straight through, preserving the immutable Cache-Control
 * header so browsers and any edge caches hold on to it.
 */
export const GET: APIRoute = async ({ params }) => {
  const genreKey = params.genreKey ?? "";
  if (!genreKey) return new Response(null, { status: 400 });

  try {
    const res = await fetchGenreArtwork(genreKey);
    if (!res.ok) return new Response(null, { status: res.status });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": res.headers.get("Cache-Control") ?? "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};

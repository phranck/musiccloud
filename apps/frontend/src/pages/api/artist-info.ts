import type { APIRoute } from "astro";

export const prerender = false;

const BACKEND_URL =
  (import.meta.env.BACKEND_URL as string | undefined) ?? process.env.BACKEND_URL ?? "http://localhost:4000";

/** Proxy GET /api/artist-info?name=&region= → backend /api/v1/artist-info */
export const GET: APIRoute = async ({ url }) => {
  const name = url.searchParams.get("name") ?? "";
  const region = url.searchParams.get("region") ?? "";

  if (!name.trim()) {
    return new Response(JSON.stringify({ error: "INVALID_REQUEST", message: "'name' is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams({ name });
  if (region) params.set("region", region);

  const res = await fetch(`${BACKEND_URL}/api/v1/artist-info?${params.toString()}`);

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

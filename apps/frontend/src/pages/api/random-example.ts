export const prerender = false;

import type { APIRoute } from "astro";
import { fetchRandomExample } from "@/api/client";

export const GET: APIRoute = async () => {
  const result = await fetchRandomExample();
  if (!result) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};

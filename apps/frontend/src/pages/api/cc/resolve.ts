import type { APIRoute } from "astro";
import { resolveCcTrack } from "@/api/client";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.json();
  const origin = request.headers.get("Origin") ?? undefined;
  const backendRes = await resolveCcTrack(body, clientAddress, origin);
  const headers = new Headers({ "Content-Type": "application/json" });
  const retryAfter = backendRes.headers.get("Retry-After");
  if (retryAfter) headers.set("Retry-After", retryAfter);

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers,
  });
};

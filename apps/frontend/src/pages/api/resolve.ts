import type { APIRoute } from "astro";
import { resolveTrack } from "@/api/client";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.json();
  const origin = request.headers.get("Origin") ?? undefined;
  const backendRes = await resolveTrack(body, clientAddress, origin);

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: { "Content-Type": "application/json" },
  });
};

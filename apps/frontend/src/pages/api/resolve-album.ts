import type { APIRoute } from "astro";
import { resolveAlbum } from "@/api/client";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.json();
  const backendRes = await resolveAlbum(body, clientAddress);

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: { "Content-Type": "application/json" },
  });
};

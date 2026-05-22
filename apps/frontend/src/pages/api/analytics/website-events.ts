import type { APIRoute } from "astro";
import { sendWebsiteAnalyticsBatch } from "@/api/client";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.text();
  const backendRes = await sendWebsiteAnalyticsBatch(body, clientAddress);

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: { "Content-Type": "application/json" },
  });
};

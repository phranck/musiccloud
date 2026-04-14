export const prerender = false;

import type { APIRoute } from "astro";
import { fetchActiveServices } from "@/api/client";

export const GET: APIRoute = async () => {
  const services = await fetchActiveServices();
  return new Response(JSON.stringify(services), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    },
  });
};

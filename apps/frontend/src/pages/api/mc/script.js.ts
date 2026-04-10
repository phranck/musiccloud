import type { APIRoute } from "astro";

export const prerender = false;

const UMAMI_URL = "https://umami.layered.work";

export const GET: APIRoute = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${UMAMI_URL}/script.js`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response("", { status: 204 });
    }

    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    clearTimeout(timeout);
    return new Response("", { status: 204 });
  }
};

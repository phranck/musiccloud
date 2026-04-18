import type { APIRoute } from "astro";

export const prerender = false;

const UMAMI_URL = "https://umami.layered.work";

export const POST: APIRoute = async ({ request }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const body = await request.text();
    const res = await fetch(`${UMAMI_URL}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    clearTimeout(timeout);
    return new Response(null, { status: 204 });
  }
};

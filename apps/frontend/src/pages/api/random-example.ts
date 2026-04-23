export const prerender = false;

import type { APIRoute } from "astro";
import { fetchRandomExample } from "@/api/client";

export const GET: APIRoute = async () => {
  try {
    const result = await fetchRandomExample();
    // Expose "no data yet" as a 200 with a null shortId instead of 404. The
    // browser otherwise flags the 404 in devtools even though the teaser is
    // an optional discovery affordance and its absence is a normal state on
    // an empty or sparsely populated DB. External clients of the v1 API
    // still get the upstream 404 semantics.
    const body = result ?? { shortId: null };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};

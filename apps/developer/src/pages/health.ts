import type { APIRoute } from "astro";

export const prerender = false;

/**
 * `GET /health` — liveness probe for the developer portal.
 *
 * Returns 200 `{"status":"ok"}` whenever the Astro SSR server is up and serving,
 * which is the signal `status.musiccloud.io` monitors for the "Developer Site"
 * service. Intentionally dependency-free (no backend call) so it reports the
 * portal's own liveness rather than an upstream's.
 *
 * @returns a JSON `{ status: "ok" }` body with HTTP 200.
 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

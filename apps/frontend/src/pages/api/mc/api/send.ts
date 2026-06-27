/**
 * @file Same-origin proxy for Umami tracking events (`/api/mc/api/send`).
 *
 * The Umami browser script is served from our own domain (see the sibling
 * `script.js.ts`) and posts its events here instead of straight to the
 * Umami host. Routing tracking through first-party paths keeps the script
 * and its beacons out of the reach of the ad/tracker blocklists that would
 * otherwise drop a third-party `umami.layered.work` request.
 *
 * ## Why the client IP must be forwarded
 *
 * Umami resolves a visitor's country/region/city from the source IP of the
 * `/api/send` request at ingest time. Because this proxy re-issues that
 * request server-side, the connection Umami sees originates from our SSR
 * host (Zerops, Prague) — not from the visitor. Without the real IP, every
 * event geolocates to the server's own location, so the Location analytics
 * collapse to ~100% Czech Republic regardless of who actually visited.
 *
 * The incoming request already carries the visitor IP in `X-Forwarded-For`,
 * set by the Zerops ingress; `clientAddress` is the fallback when the header
 * is absent (e.g. local dev). We forward that value as `X-Forwarded-For` so
 * Umami geolocates the visitor, not the proxy. This mirrors the
 * `forwardedForExtra` helper that every backend call in
 * `apps/frontend/src/api/client.ts` already uses for the same reason.
 *
 * Geolocation is resolved and stored per event at ingest, so this only fixes
 * events received after deploy; rows already written keep their old country.
 *
 * Part of a recurring incident class — any SSR proxy that drops the visitor IP
 * breaks a downstream IP consumer. See `docs/ssr-proxy-x-forwarded-for.md` for
 * the full rule and the checklist for new proxies.
 */
import type { APIRoute } from "astro";

export const prerender = false;

const UMAMI_URL = "https://umami.layered.work";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const body = await request.text();
    // Pass the visitor IP through so Umami geolocates the visitor rather
    // than this SSR proxy. See the file header for the full rationale.
    const clientIp = request.headers.get("x-forwarded-for") ?? clientAddress;
    const res = await fetch(`${UMAMI_URL}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "",
        ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
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

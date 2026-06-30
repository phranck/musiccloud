/**
 * @file Same-origin proxy for Umami tracking events (`/api/mc/api/send`).
 *
 * The Umami browser script is served from our own domain (see the sibling
 * `script.js.ts`) and posts its events here instead of straight to the
 * Umami host. Routing tracking through first-party paths keeps the script
 * and its beacons out of the reach of the ad/tracker blocklists that would
 * otherwise drop a third-party `umami.layered.work` request.
 *
 * ## Why the visitor IP travels in vendor headers, not `X-Forwarded-For`
 *
 * Umami resolves a visitor's country/region/city from the source IP of the
 * `/api/send` request at ingest time. Because this proxy re-issues that
 * request server-side, the connection Umami sees originates from our SSR
 * host (Zerops, Prague) — not from the visitor. Without the real IP every
 * event geolocates to the server and the Location analytics collapse to
 * ~100% Czech Republic regardless of who actually visited.
 *
 * The reverse proxy in front of the managed Umami instance **overwrites**
 * the standard forwarding headers (`X-Forwarded-For`, `X-Real-IP`,
 * `X-Client-IP`) with the immediate peer before Umami reads them, so none
 * of those can carry the visitor IP across this hop. It passes the vendor
 * headers `True-Client-IP` and `CF-Connecting-IP` through untouched, and
 * Umami honours them for geolocation (they win even when `X-Forwarded-For`
 * is also present). We therefore put the real visitor IP into both of
 * those, and keep `X-Forwarded-For` for any other consumer that trusts it.
 * This header behaviour was verified empirically against the live instance;
 * see `docs/ssr-proxy-x-forwarded-for.md`.
 *
 * The visitor IP is the first hop of the incoming `X-Forwarded-For` chain
 * (set by our own ingress), with `clientAddress` as the fallback when the
 * header is absent (e.g. local dev).
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
    // The managed Umami's reverse proxy clobbers X-Forwarded-For with our
    // SSR pod IP, so the visitor IP must ride in the vendor headers Umami
    // honours. The visitor is the first hop of the incoming chain. See the
    // file header for the full rationale.
    const forwardedFor = request.headers.get("x-forwarded-for");
    const visitorIp = forwardedFor?.split(",")[0]?.trim() || clientAddress;
    const res = await fetch(`${UMAMI_URL}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "",
        ...(visitorIp
          ? {
              "X-Forwarded-For": forwardedFor ?? visitorIp,
              "True-Client-IP": visitorIp,
              "CF-Connecting-IP": visitorIp,
            }
          : {}),
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

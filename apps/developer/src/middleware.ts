import { defineMiddleware } from "astro:middleware";

import { COMING_SOON_HTML } from "./lib/coming-soon";

/**
 * Whether the portal is sealed behind the "coming soon" maintenance page.
 *
 * Driven by the runtime `COMING_SOON` environment variable (read from
 * `process.env` so it can be toggled in Zerops without a rebuild). Any of
 * `true` / `1` / `yes` / `on` (case-insensitive) enables it; unset or anything
 * else leaves the real portal serving. Kept off locally so development of the
 * real flow sees the actual pages. In production the flag is set to `"true"`
 * on the `developer` service in `zerops.yml`; flip it there to open the portal.
 *
 * @returns true when every request should receive the maintenance page.
 */
function comingSoonEnabled(): boolean {
  const value = process.env.COMING_SOON?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

/**
 * Global request gate. While {@link comingSoonEnabled} is true, every portal,
 * BFF, and application-asset request is answered with the maintenance page.
 * The canonical public theme is the sole exception because the maintenance
 * response deliberately consumes the same runtime design tokens as the live
 * portal. It contains CSS values only and cannot expose unfinished app code.
 * `no-store` prevents a stale maintenance page from being cached once the flag
 * is later turned off.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname === "/developer-theme.css") {
    return next();
  }

  if (comingSoonEnabled()) {
    return new Response(COMING_SOON_HTML, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return next();
});

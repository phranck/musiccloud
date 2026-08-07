import { defineMiddleware } from "astro:middleware";
import { applySecurityHeaders, SurfaceExposure } from "@musiccloud/shared";

/**
 * Attaches the browser-boundary headers to every response this site sends.
 *
 * `SurfaceExposure.Public`, because share pages are meant to be passed around
 * and an embed on this origin stays possible. The admin dashboard is the
 * surface that refuses framing outright.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  applySecurityHeaders(response.headers, SurfaceExposure.Public);
  return response;
});

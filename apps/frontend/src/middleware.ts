import { defineMiddleware } from "astro:middleware";
import {
  applySecurityHeaders,
  buildEnforcedContentSecurityPolicy,
  hashesFromAstroPolicy,
  SurfaceExposure,
} from "@musiccloud/shared";
import { inlineBlockHash } from "@musiccloud/shared/node";
import { fetchDesignTokens } from "@/api/client";
import { designTokensToCss } from "@/lib/designTokensCss";
import { SITE_INLINE_SCRIPT_HASHES } from "@/lib/inline-scripts";

/**
 * Replaces the content policy Astro wrote with the site's complete one.
 *
 * Astro lists the hashes of the scripts and styles it emits. The site's own
 * inline scripts are named by {@link SITE_INLINE_SCRIPT_HASHES}, the design
 * token stylesheet by the hash of the text the layout writes, and server
 * rendered components carry `style` attributes. A response without Astro's
 * policy, such as an endpoint, keeps the shared reported one.
 *
 * @param headers - The response's headers, changed in place.
 * @param designTokensCss - The stylesheet the layout writes for this request,
 *   or `undefined` for a request that renders no layout.
 */
function completeContentPolicy(headers: Headers, designTokensCss: string | undefined): void {
  const astroPolicy = headers.get("content-security-policy");
  if (!astroPolicy) return;
  const { scriptHashes, styleHashes } = hashesFromAstroPolicy(astroPolicy);
  headers.set(
    "content-security-policy",
    buildEnforcedContentSecurityPolicy(SurfaceExposure.Public, {
      scriptHashes: [...scriptHashes, ...SITE_INLINE_SCRIPT_HASHES],
      styleHashes: designTokensCss === undefined ? styleHashes : [...styleHashes, inlineBlockHash(designTokensCss)],
      styleAttributes: true,
    }),
  );
}

/**
 * Builds the design token stylesheet for the request, then attaches the
 * browser-boundary headers to the response.
 *
 * The stylesheet is built here rather than in the layout so the policy and
 * the page use one string. The tokens are cached in the process
 * (`fetchDesignTokens`), so this costs no backend request on most pages.
 *
 * `SurfaceExposure.Public`, because share pages are meant to be passed around
 * and an embed on this origin stays possible. The admin dashboard is the
 * surface that refuses framing outright.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (rendersLayout(context.url.pathname)) {
    context.locals.designTokensCss = designTokensToCss(await fetchDesignTokens(context.clientAddress));
  }
  const response = await next();
  completeContentPolicy(response.headers, context.locals.designTokensCss);
  applySecurityHeaders(response.headers, SurfaceExposure.Public);
  return response;
});

/**
 * Whether a request may render the layout, and so needs the design tokens.
 * The site's API routes and Astro's server islands never do.
 */
function rendersLayout(pathname: string): boolean {
  return !pathname.startsWith("/api/") && !pathname.startsWith("/_server-islands/");
}

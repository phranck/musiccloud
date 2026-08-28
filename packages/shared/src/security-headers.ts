/**
 * @file The browser-boundary response headers every musiccloud host sends.
 *
 * Only `api.musiccloud.io` had these, because the backend registers
 * `@fastify/helmet` and its defaults emit them. The three hosts that actually
 * serve HTML to browsers are an Astro SSR app twice and a static nginx site,
 * and none of those has a plugin doing it for them. A framework protects what
 * it serves, so the policy lives here and each host applies it.
 *
 * ## Why the CSP arrives in two headers
 *
 * The enforced policy carries only the directives that cannot stop a resource
 * from loading: where the document may be framed, where forms may post, what
 * `<base>` may claim, and that plugins are refused. Getting those wrong changes
 * nothing about how the page renders.
 *
 * The directives that govern loading arrive as `Content-Security-Policy-Report-Only`,
 * because the pages carry inline `<script>` and inline `<style>` blocks that a
 * strict `script-src` and `style-src` would refuse. Report-Only names each of
 * them in the browser console without breaking anything, which is the
 * measurement needed before the policy can be enforced. Adding `'unsafe-inline'`
 * to silence the reports would defeat the exercise, so it is deliberately absent.
 *
 * Enforcing the reported policy is a separate step, once every violation has
 * been answered with a nonce or a hash.
 */

/**
 * What kind of surface a host serves, which is what the two variable
 * directives follow from.
 *
 * A public surface may be framed by its own origin and sends a referrer to
 * other origins, trimmed to the origin. A private one refuses framing outright
 * and sends no referrer at all, because its URLs carry identifiers that have no
 * business reaching another site.
 */
export const SurfaceExposure = {
  /** A site anyone may read: the public frontend, the developer portal. */
  Public: "Public",
  /** A site behind a login: the admin dashboard. */
  Private: "Private",
} as const;

/** What kind of surface a host serves. */
export type SurfaceExposure = (typeof SurfaceExposure)[keyof typeof SurfaceExposure];

/**
 * Directives that hold regardless of how a host renders, and that cannot
 * prevent a resource from loading.
 *
 * `form-action 'self'` stops a submission being redirected to another origin.
 * `base-uri 'self'` stops an injected `<base>` re-pointing every relative URL.
 * `object-src 'none'` refuses plugin content, which nothing here uses.
 */
const ENFORCED_DIRECTIVES = ["base-uri 'self'", "object-src 'none'", "form-action 'self'"] as const;

/**
 * The policy being worked towards, reported rather than enforced.
 *
 * `img-src` and `media-src` allow any HTTPS origin because artwork and audio
 * previews come from the streaming services' own CDNs, which are numerous and
 * change without notice. Everything else is same-origin: the Umami script is
 * served through the frontend's own `/api/mc` proxy rather than fetched from
 * `umami.layered.work`, so it needs no entry of its own.
 */
const REPORTED_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
] as const;

/** Browser features no musiccloud surface uses, refused for every origin. */
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

function frameAncestors(exposure: SurfaceExposure): string {
  return exposure === SurfaceExposure.Private ? "frame-ancestors 'none'" : "frame-ancestors 'self'";
}

/**
 * Builds the response headers a musiccloud host sends with every document.
 *
 * `X-Frame-Options` repeats what `frame-ancestors` already says. It stays
 * because it is the directive older browsers understand, and the two never
 * disagree because both are derived from the same argument.
 *
 * @param exposure - What kind of surface this host serves.
 * @returns Header names mapped to their values, ready to apply to a response.
 */
export function buildSecurityHeaders(exposure: SurfaceExposure): Record<string, string> {
  return {
    "Content-Security-Policy": [...ENFORCED_DIRECTIVES, frameAncestors(exposure)].join("; "),
    "Content-Security-Policy-Report-Only": [
      ...REPORTED_DIRECTIVES,
      ...ENFORCED_DIRECTIVES,
      frameAncestors(exposure),
    ].join("; "),
    "X-Frame-Options": exposure === SurfaceExposure.Private ? "DENY" : "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": exposure === SurfaceExposure.Private ? "no-referrer" : "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/**
 * Applies {@link buildSecurityHeaders} to a response, leaving any header the
 * response already set untouched.
 *
 * A route that deliberately chose its own value keeps it, so this can sit in
 * middleware without having to know which routes are special.
 *
 * @param headers - The outgoing response headers.
 * @param exposure - What kind of surface this host serves.
 */
export function applySecurityHeaders(headers: Headers, exposure: SurfaceExposure): void {
  for (const [name, value] of Object.entries(buildSecurityHeaders(exposure))) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

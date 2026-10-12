/**
 * @file The browser-boundary response headers every musiccloud host sends.
 *
 * Only `api.musiccloud.io` had these, because the backend registers
 * `@fastify/helmet` and its defaults emit them. The three hosts that actually
 * serve HTML to browsers are an Astro SSR app twice and a static nginx site,
 * and none of those has a plugin doing it for them. A framework protects what
 * it serves, so the policy lives here and each host applies it.
 *
 * ## Enforced where the inline content is known, reported elsewhere
 *
 * A document can enforce its complete policy once every inline block it
 * carries is named by a hash: see {@link buildEnforcedContentSecurityPolicy}.
 * The hashes come from the source text or from Astro, never from the rendered
 * page, because a hash of the output would also cover a script someone
 * injected into it. The developer portal's pages and its gate page enforce
 * their policy this way, and the admin dashboard enforces its own, with inline
 * styles allowed for the reasons at {@link PRIVATE_STYLE_SOURCES}.
 *
 * Every other public response gets the default from
 * {@link buildSecurityHeaders}: the directives that cannot stop a resource from
 * loading are enforced, and the loading directives arrive as
 * `Content-Security-Policy-Report-Only`. Report-Only names each refusal in the
 * browser console without breaking anything, which is the measurement needed
 * before the policy can be enforced there too. Adding `'unsafe-inline'` to
 * silence the reports would defeat the exercise, so it is deliberately absent.
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
import { YOUTUBE_EMBED_HOST } from "./markdown-shortcodes/media.js";

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
 * Where musiccloud's Umami analytics instance runs.
 *
 * No page loads anything from it. The site and the developer portal serve the
 * script and accept its events through their own `/api/mc` routes, which call
 * this host server-side, so the policy below needs no entry for it and the
 * beacons stay clear of the blocklists that drop third-party trackers.
 */
export const UMAMI_ORIGIN = "https://umami.layered.work";

/** The script sources every page may load, before the hashes of its own inline scripts. */
const SCRIPT_SOURCES = "script-src 'self'";

/** The style sources every page may load, before the hashes of its own inline styles. */
const STYLE_SOURCES = "style-src 'self'";

/**
 * The style sources of the admin dashboard, which allow inline styles.
 *
 * The dashboard writes styles at runtime that no hash can name. The code
 * editor mounts a `<style>` element whose rules follow its configuration, the
 * overlays mount their keyframes, and the email preview renders a template's
 * own `<style>` blocks and `style` attributes in a `srcdoc` frame, which is
 * held to this policy. Scripts stay on `'self'`, which is what stops an
 * injected script.
 */
const PRIVATE_STYLE_SOURCES = `${STYLE_SOURCES} 'unsafe-inline'`;

/**
 * The policy being worked towards, reported rather than enforced.
 *
 * `img-src` and `media-src` allow any HTTPS origin because artwork and audio
 * previews come from the streaming services' own CDNs, which are numerous and
 * change without notice. Everything else is same-origin: the Umami script is
 * served through each host's own `/api/mc` proxy rather than fetched from
 * {@link UMAMI_ORIGIN}, so it needs no entry of its own.
 */
const REPORTED_DIRECTIVES = [
  "default-src 'self'",
  SCRIPT_SOURCES,
  STYLE_SOURCES,
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  // A page may hold a YouTube video, and the frame it opens in is loaded from
  // the host the renderer builds that address from. Nothing reaches it until a
  // reader plays the video.
  `frame-src 'self' ${YOUTUBE_EMBED_HOST}`,
  "upgrade-insecure-requests",
] as const;

/** Browser features no musiccloud surface uses, refused for every origin. */
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

const CONTENT_SECURITY_POLICY = "Content-Security-Policy";
const CONTENT_SECURITY_POLICY_REPORT_ONLY = "Content-Security-Policy-Report-Only";

function frameAncestors(exposure: SurfaceExposure): string {
  return exposure === SurfaceExposure.Private ? "frame-ancestors 'none'" : "frame-ancestors 'self'";
}

/**
 * Builds the response headers a musiccloud host sends with every document.
 *
 * A private surface gets its complete policy enforced. A public one gets the
 * non-loading directives enforced and the rest reported, which is the default
 * for a response whose inline content is not known. The file header says why.
 *
 * `X-Frame-Options` repeats what `frame-ancestors` already says. It stays
 * because it is the directive older browsers understand, and the two never
 * disagree because both are derived from the same argument.
 *
 * @param exposure - What kind of surface this host serves.
 * @returns Header names mapped to their values, ready to apply to a response.
 */
export function buildSecurityHeaders(exposure: SurfaceExposure): Record<string, string> {
  const contentPolicy: Record<string, string> =
    exposure === SurfaceExposure.Private
      ? { [CONTENT_SECURITY_POLICY]: buildEnforcedContentSecurityPolicy(exposure) }
      : {
          [CONTENT_SECURITY_POLICY]: [...ENFORCED_DIRECTIVES, frameAncestors(exposure)].join("; "),
          [CONTENT_SECURITY_POLICY_REPORT_ONLY]: [
            ...REPORTED_DIRECTIVES,
            ...ENFORCED_DIRECTIVES,
            frameAncestors(exposure),
          ].join("; "),
        };
  return {
    ...contentPolicy,
    "X-Frame-Options": exposure === SurfaceExposure.Private ? "DENY" : "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": exposure === SurfaceExposure.Private ? "no-referrer" : "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/**
 * What a document's own inline content needs from its content policy. Each
 * hash is a CSP hash source without its quotes, such as `sha256-…`, taken from
 * the text the document renders, never from the rendered document.
 *
 * @property scriptHashes - Hashes of the inline `<script>` blocks that run.
 * @property styleHashes - Hashes of the inline `<style>` blocks.
 * @property styleAttributes - Whether the markup carries `style` attributes,
 *   which no hash names. They are allowed through `style-src-attr
 *   'unsafe-inline'`: an attribute sets a style, but it runs no script and
 *   selects no other element.
 */
export interface InlineContent {
  scriptHashes?: readonly string[];
  styleHashes?: readonly string[];
  styleAttributes?: boolean;
}

/** The directive that admits every `style` attribute while `style-src` stays on hashes. */
const STYLE_ATTRIBUTES_ALLOWED = "style-src-attr 'unsafe-inline'";

/** A source list followed by the quoted hashes that extend it. */
function withHashes(sources: string, hashes: readonly string[] = []): string {
  return [sources, ...hashes.map((hash) => `'${hash}'`)].join(" ");
}

/**
 * The complete content policy, enforced, for a document whose inline blocks
 * are all known.
 *
 * It carries every directive {@link buildSecurityHeaders} reports, with the
 * given hashes added to `script-src` and `style-src` and, where the markup
 * carries `style` attributes, `style-src-attr 'unsafe-inline'`, and every
 * directive it enforces. A response that sets this needs no Report-Only
 * header beside it, and {@link applySecurityHeaders} adds none.
 *
 * A private surface allows inline styles through `'unsafe-inline'` and takes
 * no style hashes, because a browser that finds a hash in the same list
 * ignores `'unsafe-inline'`.
 *
 * @param exposure - What kind of surface the document belongs to.
 * @param inline - What the document's own inline content needs.
 * @returns The value of a `Content-Security-Policy` header.
 */
export function buildEnforcedContentSecurityPolicy(exposure: SurfaceExposure, inline: InlineContent = {}): string {
  const styleSources = exposure === SurfaceExposure.Private ? PRIVATE_STYLE_SOURCES : STYLE_SOURCES;
  const loading = REPORTED_DIRECTIVES.flatMap((directive) => {
    if (directive === SCRIPT_SOURCES) return [withHashes(directive, inline.scriptHashes)];
    if (directive !== STYLE_SOURCES) return [directive];
    const styles = withHashes(styleSources, inline.styleHashes);
    return inline.styleAttributes ? [styles, STYLE_ATTRIBUTES_ALLOWED] : [styles];
  });
  return [...loading, ...ENFORCED_DIRECTIVES, frameAncestors(exposure)].join("; ");
}

/** A CSP hash source inside its quotes, such as `'sha256-…'`. */
const QUOTED_HASH_SOURCE = /'(sha(?:256|384|512)-[^']+)'/g;

/**
 * The hashes Astro lists in the `content-security-policy` header it writes
 * when `experimental.csp` is on.
 *
 * Astro computes them from what it emits, its island runtime and the scripts
 * and styles it bundles, never from a rendered page, so they are safe to
 * carry into the complete policy. Astro's own header carries no other
 * directive the hosts need, which is why it is replaced rather than kept.
 *
 * @param astroPolicy - The value of the header Astro set on a response.
 * @returns The script and style hashes, without their quotes.
 */
export function hashesFromAstroPolicy(
  astroPolicy: string,
): Required<Pick<InlineContent, "scriptHashes" | "styleHashes">> {
  const directive = (name: string) =>
    astroPolicy
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name} `)) ?? "";
  const hashesOf = (entry: string) => [...entry.matchAll(QUOTED_HASH_SOURCE)].map((match) => match[1]);
  return { scriptHashes: hashesOf(directive("script-src")), styleHashes: hashesOf(directive("style-src")) };
}

/**
 * Applies {@link buildSecurityHeaders} to a response, leaving any header the
 * response already set untouched.
 *
 * A route that deliberately chose its own value keeps it, so this can sit in
 * middleware without having to know which routes are special. The content
 * policy and its Report-Only twin count as one: a route that set its own
 * policy gets neither, because a Report-Only header beside a complete policy
 * would report the very inline blocks that policy allows.
 *
 * @param headers - The outgoing response headers.
 * @param exposure - What kind of surface this host serves.
 */
export function applySecurityHeaders(headers: Headers, exposure: SurfaceExposure): void {
  const routeSetItsPolicy = headers.has(CONTENT_SECURITY_POLICY);
  for (const [name, value] of Object.entries(buildSecurityHeaders(exposure))) {
    if (headers.has(name)) continue;
    if (routeSetItsPolicy && name === CONTENT_SECURITY_POLICY_REPORT_ONLY) continue;
    headers.set(name, value);
  }
}

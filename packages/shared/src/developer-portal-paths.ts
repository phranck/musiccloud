/**
 * @file Which paths the developer portal serves itself, and which it does not.
 *
 * Every side asks this and they have to agree. The portal asks before looking
 * a page up at all, the backend asks before answering and before storing a
 * publication, and the dashboard asks before offering a path for editing.
 * Where they disagree, one of them refuses a page the other would serve, and
 * the reader gets a 404 for a page that exists or a page where the portal
 * expected its own screen.
 *
 * So the normalization every comparison starts from lives here too: a path
 * the dashboard reads one way and the backend another is the same
 * disagreement one step earlier.
 */

import { isSameSiteRelativePath } from "./safe-url.js";

/**
 * Prefixes the portal builds itself.
 *
 * A prefix covers everything beneath it, so `/dashboard` also covers
 * `/dashboard/projects`.
 */
export const PORTAL_RESERVED_PREFIXES = [
  "/api",
  "/auth",
  "/dashboard",
  "/docs",
  "/forgot",
  "/login",
  "/pricing",
  "/reset",
  "/signup",
  "/verify",
] as const;

/**
 * Reserved paths that are nonetheless a page somebody edits.
 *
 * `/docs` and `/pricing` are both: the portal owns the route, because each
 * knows which header tab is current and `/pricing` has a signup notice to
 * show, whilst what a reader actually reads is copy. Everything **beneath**
 * them stays the portal's own, which is why the exception is the exact path
 * rather than the prefix.
 */
export const PORTAL_EDITORIAL_RESERVED_PATHS = new Set<string>(["/docs", "/pricing"]);

/** The root of the documentation the portal's Docs navigation entry owns. */
const PORTAL_DOCS_ROOT = "/docs";

/** The base a navigation link is resolved against to read its path. */
const NAVIGATION_URL_BASE = "https://navigation.invalid";

/**
 * Brings a path, as it was typed or stored, to the one form every comparison
 * uses: a single leading slash, no trailing one, no empty segments, percent
 * decoded and in Unicode NFC.
 *
 * @param path - The path to normalize.
 * @returns The normalized path; `/` for an empty one.
 * @throws Error when the path holds a backslash or an encoded `/` or `\`,
 *   invalid percent encoding, a `.` or `..` segment, or a `?`, `#` or NUL.
 *   Each of these could make two readers see two different paths.
 */
export function normalizeEditorialPath(path: string): string {
  const candidate = path.trim();
  if (candidate.includes("\\") || /%(?:2f|5c)/i.test(candidate)) {
    throw new Error("Editorial path contains an ambiguous separator");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    throw new Error("Editorial path contains invalid percent encoding");
  }

  const segments = decoded
    .normalize("NFC")
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Editorial path contains traversal segments");
  }

  if (segments.some((segment) => segment.includes("\0") || segment.includes("?") || segment.includes("#"))) {
    throw new Error("Editorial path contains invalid path characters");
  }

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * {@link normalizeEditorialPath} for a caller that only needs to know whether
 * the path is usable, such as a form that leaves the reason to the server.
 *
 * @param path - The path to normalize.
 * @returns The normalized path, or `null` where {@link normalizeEditorialPath}
 *   would throw.
 */
export function tryNormalizeEditorialPath(path: string): string | null {
  try {
    return normalizeEditorialPath(path);
  } catch {
    return null;
  }
}

/**
 * Whether an editorial page may be served at this path.
 *
 * @param normalizedPath - The path, already through
 *   {@link normalizeEditorialPath}.
 * @returns `true` when the portal serves this path itself and no stored page
 *   may take it.
 */
export function isPortalReservedPath(normalizedPath: string): boolean {
  if (PORTAL_EDITORIAL_RESERVED_PATHS.has(normalizedPath)) return false;

  return PORTAL_RESERVED_PREFIXES.some(
    (reserved) => normalizedPath === reserved || normalizedPath.startsWith(`${reserved}/`),
  );
}

/**
 * {@link isPortalReservedPath} for a path that has not been normalized yet.
 *
 * @param path - The path as it was typed or stored.
 * @returns `true` when no editorial page may take it.
 * @throws Error when the path cannot be normalized, see
 *   {@link normalizeEditorialPath}.
 */
export function isReservedDeveloperPortalPath(path: string): boolean {
  return isPortalReservedPath(normalizeEditorialPath(path));
}

/**
 * Whether a path lies in the docs namespace: `/docs` and everything beneath
 * it.
 *
 * This is the question navigation asks. The Docs system entry owns the whole
 * namespace, so no other navigation entry may point into it, not even at the
 * landing page. A stored page asks {@link isPortalOwnedDocsPath} instead.
 *
 * @param normalizedPath - The path, already through
 *   {@link normalizeEditorialPath}.
 * @returns `true` for `/docs` and every path beneath it.
 */
export function isPortalDocsNamespace(normalizedPath: string): boolean {
  return normalizedPath === PORTAL_DOCS_ROOT || normalizedPath.startsWith(`${PORTAL_DOCS_ROOT}/`);
}

/**
 * Whether the portal builds this docs path itself: everything beneath
 * `/docs`, and not `/docs`.
 *
 * This is the question a stored Developer Portal page asks. The docs landing
 * page at `/docs` is copy and may be published, whilst the API reference and
 * the search beneath it are the portal's. Navigation asks
 * {@link isPortalDocsNamespace} instead.
 *
 * @param normalizedPath - The path, already through
 *   {@link normalizeEditorialPath}.
 * @returns `true` for a path beneath `/docs` that the portal serves itself.
 */
export function isPortalOwnedDocsPath(normalizedPath: string): boolean {
  return isPortalDocsNamespace(normalizedPath) && isPortalReservedPath(normalizedPath);
}

/**
 * Whether a navigation link points into the docs namespace, so only the Docs
 * system entry may hold it.
 *
 * A link to another site is never in it. A path on this site whose path part
 * cannot be normalized counts as being in it, because nothing can show that
 * it is not.
 *
 * @param url - The link as typed or stored, already trimmed.
 * @returns `true` when the link reaches `/docs` or a path beneath it on this
 *   site.
 */
export function isPortalDocsNavigationUrl(url: string): boolean {
  if (!isSameSiteRelativePath(url)) return false;

  let pathname: string;
  try {
    pathname = new URL(url, NAVIGATION_URL_BASE).pathname;
  } catch {
    return true;
  }
  const normalized = tryNormalizeEditorialPath(pathname);
  return normalized === null || isPortalDocsNamespace(normalized);
}

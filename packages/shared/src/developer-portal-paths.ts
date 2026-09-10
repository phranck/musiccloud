/**
 * @file Which paths the developer portal serves itself, and which it does not.
 *
 * Two sides ask this and they have to agree. The portal asks before looking a
 * page up at all, and the backend asks before answering. Where they disagree,
 * one of them refuses a page the other would serve, and the reader gets a 404
 * for a page that exists or a page where the portal expected its own screen.
 *
 * The two lists were separate until a page had to move between them, and then
 * only one of them moved.
 */

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

/**
 * Whether an editorial page may be served at this path.
 *
 * @param normalizedPath - The path, already normalised to a single leading
 *   slash and no trailing one.
 * @returns `true` when the portal serves this path itself and no stored page
 *   may take it.
 */
export function isPortalReservedPath(normalizedPath: string): boolean {
  if (PORTAL_EDITORIAL_RESERVED_PATHS.has(normalizedPath)) return false;

  return PORTAL_RESERVED_PREFIXES.some(
    (reserved) => normalizedPath === reserved || normalizedPath.startsWith(`${reserved}/`),
  );
}

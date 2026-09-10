/**
 * Paths the portal serves itself, which an editorial page may not take.
 *
 * A prefix reserves everything beneath it as well, so `/dashboard` also covers
 * `/dashboard/projects`.
 */
const RESERVED_DEVELOPER_PORTAL_PREFIXES = ["/docs", "/login", "/signup", "/auth", "/api", "/dashboard"];

/**
 * Reserved prefixes whose own path is nonetheless editorial.
 *
 * `/docs` is the one: everything beneath it is the API reference and the
 * search, which the portal builds, whilst the landing page a developer arrives
 * at is copy somebody should be able to change without a deployment.
 */
const EDITORIAL_ROOTS_OF_RESERVED_PREFIXES = new Set(["/docs"]);

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
 * Whether the portal serves this path itself.
 *
 * @param path - The path being asked for.
 * @returns `true` when no editorial page may take it.
 */
export function isReservedDeveloperPortalPath(path: string): boolean {
  const normalizedPath = normalizeEditorialPath(path);
  if (EDITORIAL_ROOTS_OF_RESERVED_PREFIXES.has(normalizedPath)) return false;

  return RESERVED_DEVELOPER_PORTAL_PREFIXES.some(
    (reservedPath) => normalizedPath === reservedPath || normalizedPath.startsWith(`${reservedPath}/`),
  );
}

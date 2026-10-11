import { isPortalReservedPath } from "@musiccloud/shared";

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
  return isPortalReservedPath(normalizeEditorialPath(path));
}

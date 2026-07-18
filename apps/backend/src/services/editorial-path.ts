const RESERVED_DEVELOPER_PORTAL_PREFIXES = ["/docs", "/login", "/signup", "/auth", "/api", "/dashboard"];

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

export function isReservedDeveloperPortalPath(path: string): boolean {
  const normalizedPath = normalizeEditorialPath(path);
  return RESERVED_DEVELOPER_PORTAL_PREFIXES.some(
    (reservedPath) => normalizedPath === reservedPath || normalizedPath.startsWith(`${reservedPath}/`),
  );
}

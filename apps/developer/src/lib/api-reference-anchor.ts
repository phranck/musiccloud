/**
 * Builds the stable in-page anchor shared by generated operation headings and
 * their compact sidebar entries. Keeping the normalization in one place avoids
 * link drift when the OpenAPI contract introduces new methods or path shapes.
 */
export function apiReferenceOperationAnchor(method: string, path: string): string {
  const normalizedPath = path
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `endpoint-${method.toLowerCase()}-${normalizedPath || "root"}`;
}

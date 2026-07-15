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

/**
 * Builds the stable in-page anchor for a named OpenAPI component schema.
 * Response and request-body links use this exact normalization so their hash
 * always matches the generated schema heading, including PascalCase names.
 */
export function apiReferenceSchemaAnchor(name: string): string {
  const slug = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `schema-${slug}`;
}

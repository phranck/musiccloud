/**
 * @file Finalizes the generated OpenAPI document before it is served at
 * `/docs/json` and rendered by the Scalar API reference.
 *
 * `@fastify/swagger` produces a document straight from the route table. Two
 * properties of that raw output are wrong for a *public* reference and are
 * corrected here, in one pure pass:
 *
 * ## 1. Orphan schema pruning (information disclosure)
 *
 * Every schema registered via `app.addSchema` lands in
 * `components.schemas`, even when the only routes that reference it are
 * hidden (admin, developer-portal, content, nav, services …). That leaks the
 * shape of internal models (field names, types) into the public document.
 * We keep only the schemas transitively reachable from a *visible* path, so a
 * hidden endpoint's models never appear.
 *
 * ## 2. Deterministic alphabetical ordering
 *
 * Scalar renders tag groups in `tags` order and operations in `paths` order.
 * The raw document lists both in route-registration order, which drifts as
 * code moves. Sorting tags, paths, and schema keys alphabetically gives the
 * reference a stable, predictable layout regardless of registration order.
 *
 * The function is pure: it returns a new document and does not mutate input.
 */

/**
 * Minimal structural view of the parts of an OpenAPI 3 document this module
 * reads or reorders. Everything else passes through untouched via the spread.
 */
export interface FinalizableOpenApiDocument {
  /** Top-level tag definitions; their order drives Scalar's group order. */
  tags?: Array<{ name: string; description?: string }>;
  /** Path item objects keyed by route; their order drives operation order. */
  paths?: Record<string, unknown>;
  /** Components bag; only `schemas` is inspected and pruned. */
  components?: { schemas?: Record<string, unknown> };
}

/** Stable, locale-aware comparator so ordering is deterministic across runs. */
const byAlpha = (a: string, b: string): number => a.localeCompare(b);

/**
 * Recursively collects every schema name referenced via a `$ref` anywhere in
 * `node`. A `$ref` looks like `#/components/schemas/<Name>`; only the trailing
 * `<Name>` is recorded.
 *
 * @param node - any JSON value from the OpenAPI document
 * @param acc  - set the discovered schema names are added to (mutated)
 */
function collectRefNames(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefNames(item, acc);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        const name = value.split("/").pop();
        if (name) acc.add(name);
      } else {
        collectRefNames(value, acc);
      }
    }
  }
}

/**
 * Computes the set of schema names reachable from the document's paths,
 * following `$ref`s transitively through the schema graph. A schema only
 * referenced by another reachable schema is itself reachable.
 *
 * @param paths   - the document's `paths` object (visible operations only)
 * @param schemas - the document's `components.schemas` map
 * @returns the set of schema names that must be kept in the public document
 */
function reachableSchemaNames(paths: Record<string, unknown>, schemas: Record<string, unknown>): Set<string> {
  const reachable = new Set<string>();
  const seed = new Set<string>();
  collectRefNames(paths, seed);

  const queue = [...seed];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || reachable.has(name)) continue;
    reachable.add(name);

    const nested = new Set<string>();
    collectRefNames(schemas[name], nested);
    for (const child of nested) {
      if (!reachable.has(child)) queue.push(child);
    }
  }
  return reachable;
}

/**
 * Returns a finalized copy of the OpenAPI document: orphan schemas removed
 * (see file header §1) and tags, paths, and schemas sorted alphabetically
 * (§2). Input is not mutated.
 *
 * Accepts a structurally wider input (e.g. `@fastify/swagger`'s `Document`)
 * and preserves every untouched field at runtime via the spread; only the
 * sorted/pruned subset is reflected in the return type.
 *
 * @param doc - the raw document from `app.swagger()`
 * @returns a new document safe to serve as the public reference
 */
export function finalizePublicOpenApiDocument(doc: FinalizableOpenApiDocument): FinalizableOpenApiDocument {
  const paths = doc.paths ?? {};
  const schemas = doc.components?.schemas ?? {};

  const reachable = reachableSchemaNames(paths, schemas);

  const prunedSchemas: Record<string, unknown> = {};
  for (const name of Object.keys(schemas).sort(byAlpha)) {
    if (reachable.has(name)) prunedSchemas[name] = schemas[name];
  }

  const sortedPaths: Record<string, unknown> = {};
  for (const route of Object.keys(paths).sort(byAlpha)) {
    sortedPaths[route] = paths[route];
  }

  const sortedTags = doc.tags ? [...doc.tags].sort((a, b) => byAlpha(a.name, b.name)) : doc.tags;

  return {
    ...doc,
    tags: sortedTags,
    paths: sortedPaths,
    components: { ...doc.components, schemas: prunedSchemas },
  };
}

/**
 * Display-ready API reference model consumed by Astro components.
 *
 * This intentionally hides raw OpenAPI path-item internals from the page layer:
 * routes are already grouped, media types expose resolved local schema names,
 * and schema anchors are stable for in-page navigation.
 */
export interface ApiReference {
  version: string;
  title: string;
  auth: {
    scheme: "ApiKeyAuth";
    headerName: "X-API-Key";
  };
  groups: ApiOperationGroup[];
  schemas: Record<string, ApiSchema>;
}

export interface ApiOperationGroup {
  name: string;
  operations: ApiOperation[];
}

export interface ApiOperation {
  operationId?: string;
  /** Short label for compact navigation, independent from the full content summary. */
  navTitle: string;
  method: string;
  path: string;
  /** True when this operation declares the public X-API-Key security scheme. */
  requiresApiKey: boolean;
  summary?: string;
  description?: string;
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
}

export interface ApiParameter {
  name: string;
  location: string;
  required: boolean;
  description?: string;
  schema?: unknown;
}

export interface ApiRequestBody {
  required: boolean;
  mediaTypes: ApiMediaType[];
}

export interface ApiResponse {
  status: string;
  description: string;
  mediaTypes: ApiMediaType[];
}

export interface ApiMediaType {
  mediaType: string;
  schemaRef?: string;
  schema?: unknown;
  example?: unknown;
}

export interface ApiSchema {
  name: string;
  anchor: string;
  description?: string;
  schema: Record<string, unknown>;
}

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

/**
 * Purpose-written labels for the reference rail. They deliberately live in
 * the portal presentation layer: changing a navigation label must not alter
 * the published API contract fingerprint or force an SDK release.
 */
const CURATED_NAVIGATION_TITLES: Record<string, string> = {
  "GET /api/v1/artist-info": "Artist info",
  "GET /api/v1/cc/artist-info": "Creative Commons artist info",
  "GET /api/v1/cc/audio/{jamendoId}": "Creative Commons audio",
  "GET /api/v1/cc/bandcamp/{jamendoId}": "Bandcamp availability",
  "GET /api/v1/cc/download/{jamendoId}": "Creative Commons download",
  "GET /api/v1/cc/genre-artwork/{genreKey}": "Creative Commons genre artwork",
  "GET /api/v1/cc/random-example": "Creative Commons example",
  "POST /api/v1/cc/resolve": "Creative Commons resolve",
  "POST /api/v1/forms/{slug}/submit": "Submit form",
  "GET /api/v1/genre-artwork/{genreKey}": "Genre artwork",
  "GET /api/v1/link/{id}": "Link metadata",
  "GET /api/v1/resolve": "Quick resolve",
  "POST /api/v1/resolve": "Resolve link",
  "GET /api/v1/share/{shortId}": "Share",
  "GET /api/v1/share/{shortId}/preview": "Refresh preview",
  "GET /api/v1/tiers": "Pricing tiers",
  "GET /health/backend": "Backend",
  "GET /health/dashboard": "Dashboard",
  "GET /health/db": "Database",
  "GET /health/developer": "Developer portal",
  "GET /health/email": "Email",
  "GET /health/frontend": "Frontend",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Invalid OpenAPI document: missing ${label}.`);
  return result;
}

/** Converts a stable OpenAPI operation ID into a readable navigation fallback. */
function humanizeOperationId(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Returns the concise sidebar label without changing the full endpoint copy.
 * `x-nav-title` is the authored contract value; operation IDs and summaries
 * keep older contracts usable until they receive curated navigation labels.
 */
function buildNavigationTitle(operation: Record<string, unknown>, method: string, path: string): string {
  const authoredTitle = stringValue(operation["x-nav-title"])?.trim();
  if (authoredTitle) return authoredTitle;

  const curatedTitle = CURATED_NAVIGATION_TITLES[`${method.toUpperCase()} ${path}`];
  if (curatedTitle) return curatedTitle;

  const operationId = stringValue(operation.operationId)?.trim();
  if (operationId) return humanizeOperationId(operationId);

  const summary = stringValue(operation.summary)?.trim();
  if (summary)
    return (
      summary
        .replace(/\s*\([^)]*\)\s*$/, "")
        .split(/[,;:]/, 1)[0]
        ?.trim() || summary
    );

  return `${method.toUpperCase()} ${path}`;
}

function schemaAnchor(name: string): string {
  const slug = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `schema-${slug}`;
}

function extractLocalSchemaRef(schema: unknown, schemas: Record<string, unknown>): string | undefined {
  if (!isRecord(schema)) return undefined;
  const ref = stringValue(schema.$ref);
  if (!ref) return undefined;
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported OpenAPI schema reference: ${ref}.`);
  }
  const name = ref.slice(prefix.length);
  if (!schemas[name]) {
    throw new Error(`Unknown OpenAPI schema reference: ${name}.`);
  }
  return name;
}

function assertKnownSchemaRefs(value: unknown, schemas: Record<string, unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) assertKnownSchemaRefs(item, schemas);
    return;
  }
  if (!isRecord(value)) return;

  extractLocalSchemaRef(value, schemas);
  for (const child of Object.values(value)) assertKnownSchemaRefs(child, schemas);
}

function buildMediaTypes(content: unknown, schemas: Record<string, unknown>): ApiMediaType[] {
  if (!isRecord(content)) return [];
  return Object.entries(content)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mediaType, mediaObject]) => {
      if (!isRecord(mediaObject)) return { mediaType };
      const schema = mediaObject.schema;
      const schemaRef = extractLocalSchemaRef(schema, schemas);
      if (!schemaRef) assertKnownSchemaRefs(schema, schemas);
      return {
        mediaType,
        ...(schemaRef ? { schemaRef } : schema ? { schema } : {}),
        ...(mediaObject.example !== undefined ? { example: mediaObject.example } : {}),
      };
    });
}

function buildParameters(value: unknown): ApiParameter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid OpenAPI document: operation parameters must be an array.");
  return value.map((parameter) => {
    if (!isRecord(parameter)) throw new Error("Invalid OpenAPI document: parameter must be an object.");
    return {
      name: requiredString(parameter.name, "parameter.name"),
      location: requiredString(parameter.in, "parameter.in"),
      required: parameter.required === true,
      ...(stringValue(parameter.description) ? { description: stringValue(parameter.description) } : {}),
      ...(parameter.schema !== undefined ? { schema: parameter.schema } : {}),
    };
  });
}

function buildRequestBody(value: unknown, schemas: Record<string, unknown>): ApiRequestBody | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Invalid OpenAPI document: requestBody must be an object.");
  return {
    required: value.required === true,
    mediaTypes: buildMediaTypes(value.content, schemas),
  };
}

function buildResponses(value: unknown, schemas: Record<string, unknown>): ApiResponse[] {
  if (!isRecord(value)) throw new Error("Invalid OpenAPI document: operation responses must be an object.");
  return Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([status, response]) => {
      if (!isRecord(response)) throw new Error("Invalid OpenAPI document: response must be an object.");
      return {
        status,
        description: stringValue(response.description) ?? "",
        mediaTypes: buildMediaTypes(response.content, schemas),
      };
    });
}

function buildApiKeyRequirement(operation: Record<string, unknown>): boolean {
  const security = operation.security;
  if (security === undefined) return false;
  if (!Array.isArray(security)) throw new Error("Invalid OpenAPI document: operation security must be an array.");
  const hasApiKey = security.some((entry) => isRecord(entry) && Object.hasOwn(entry, "ApiKeyAuth"));
  const hasUnsupportedScheme = security.some(
    (entry) => isRecord(entry) && Object.keys(entry).some((scheme) => scheme !== "ApiKeyAuth"),
  );
  if (hasUnsupportedScheme) {
    throw new Error("Invalid OpenAPI document: public operation security must use ApiKeyAuth only.");
  }
  return hasApiKey;
}

function buildSchemas(value: unknown): Record<string, ApiSchema> {
  if (!isRecord(value)) return {};
  const schemas: Record<string, ApiSchema> = {};
  for (const [name, schema] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(schema)) throw new Error(`Invalid OpenAPI document: schema ${name} must be an object.`);
    schemas[name] = {
      name,
      anchor: schemaAnchor(name),
      ...(stringValue(schema.description) ? { description: stringValue(schema.description) } : {}),
      schema,
    };
  }
  return schemas;
}

/**
 * Converts the finalized public OpenAPI document into the portal's stable
 * presentation model and rejects contract drift that would make the generated
 * reference misleading, such as unsupported security schemes or unresolved
 * local refs.
 */
export function buildApiReference(document: unknown): ApiReference {
  if (!isRecord(document)) throw new Error("Invalid OpenAPI document: root must be an object.");
  const info = document.info;
  if (!isRecord(info)) throw new Error("Invalid OpenAPI document: missing info.");
  const version = requiredString(info.version, "info.version");
  const title = stringValue(info.title) ?? "musiccloud Public API";

  const components = isRecord(document.components) ? document.components : {};
  const securitySchemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  const apiKeyAuth = securitySchemes.ApiKeyAuth;
  if (
    !isRecord(apiKeyAuth) ||
    apiKeyAuth.type !== "apiKey" ||
    apiKeyAuth.in !== "header" ||
    apiKeyAuth.name !== "X-API-Key"
  ) {
    throw new Error("Invalid OpenAPI document: ApiKeyAuth must be an X-API-Key header scheme.");
  }

  const rawSchemas = isRecord(components.schemas) ? components.schemas : {};
  for (const schema of Object.values(rawSchemas)) assertKnownSchemaRefs(schema, rawSchemas);
  const schemas = buildSchemas(rawSchemas);

  const paths = document.paths;
  if (!isRecord(paths)) throw new Error("Invalid OpenAPI document: missing paths.");

  const groupsByName = new Map<string, ApiOperation[]>();
  for (const [path, pathItem] of Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(pathItem)) throw new Error(`Invalid OpenAPI document: path item ${path} must be an object.`);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!isRecord(operation))
        throw new Error(`Invalid OpenAPI document: operation ${method.toUpperCase()} ${path} must be an object.`);
      const requiresApiKey = buildApiKeyRequirement(operation);

      const tags = Array.isArray(operation.tags)
        ? operation.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      const groupName = tags[0] ?? "Other";
      const operations = groupsByName.get(groupName) ?? [];
      const requestBody = buildRequestBody(operation.requestBody, rawSchemas);
      operations.push({
        method: method.toUpperCase(),
        path,
        navTitle: buildNavigationTitle(operation, method, path),
        requiresApiKey,
        ...(stringValue(operation.operationId) ? { operationId: stringValue(operation.operationId) } : {}),
        ...(stringValue(operation.summary) ? { summary: stringValue(operation.summary) } : {}),
        ...(stringValue(operation.description) ? { description: stringValue(operation.description) } : {}),
        parameters: buildParameters(operation.parameters),
        ...(requestBody ? { requestBody } : {}),
        responses: buildResponses(operation.responses, rawSchemas),
      });
      groupsByName.set(groupName, operations);
    }
  }

  const groups = [...groupsByName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, operations]) => ({
      name,
      operations: operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    }));

  return {
    version,
    title,
    auth: { scheme: "ApiKeyAuth", headerName: "X-API-Key" },
    groups,
    schemas,
  };
}

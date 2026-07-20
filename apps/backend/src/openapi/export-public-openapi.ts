import { createHash } from "node:crypto";
import type { PublicErrorCodeEntry } from "@musiccloud/shared";

export interface PublicOpenApiDocument {
  openapi: string;
  info: { title?: string; version: string; description?: string };
  paths: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description?: string }>;
  "x-musiccloud-error-codes"?: readonly PublicErrorCodeEntry[];
}

export interface PublicOpenApiExport {
  document: PublicOpenApiDocument;
  json: string;
  sha256: string;
  version: string;
}

const EXCLUDED_PATH_PREFIXES = [
  "/api/admin",
  "/api/auth",
  "/api/dev",
  "/api/v1/content",
  "/api/v1/nav",
  "/api/v1/site-settings",
  "/api/v1/services",
  "/api/v1/random",
  "/api/v1/telemetry",
] as const;

const HTTP_METHODS = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Produces deterministic JSON bytes for fingerprinting and release artifacts.
 * OpenAPI route registration order must not affect the SDK release hash.
 */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function assertStablePublicOperationIds(document: PublicOpenApiDocument): void {
  const operationIds = new Set<string>();

  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
    for (const [method, rawOperation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation =
        rawOperation && typeof rawOperation === "object" && !Array.isArray(rawOperation)
          ? (rawOperation as Record<string, unknown>)
          : {};
      const operationId = typeof operation.operationId === "string" ? operation.operationId.trim() : "";
      if (!operationId) {
        throw new Error(`OpenAPI export failed: missing operationId (${method.toUpperCase()} ${route}).`);
      }
      if (operationIds.has(operationId)) {
        throw new Error(`OpenAPI export failed: duplicate operationId (${operationId}).`);
      }
      operationIds.add(operationId);
    }
  }
}

function assertPublicContract(document: PublicOpenApiDocument): void {
  if (!/^\d+\.\d+\.\d+$/.test(document.info?.version ?? "")) {
    throw new Error("OpenAPI export failed: info.version must be semver.");
  }

  for (const path of Object.keys(document.paths ?? {})) {
    const excludedPrefix = EXCLUDED_PATH_PREFIXES.find((prefix) => path.startsWith(prefix));
    if (excludedPrefix) {
      throw new Error(`OpenAPI export failed: internal path leaked (${path}, prefix ${excludedPrefix}).`);
    }
  }

  const securitySchemes = document.components?.securitySchemes ?? {};
  if (!securitySchemes.ApiKeyAuth) {
    throw new Error("OpenAPI export failed: ApiKeyAuth security scheme is required.");
  }
  if (securitySchemes.BearerAuth) {
    throw new Error("OpenAPI export failed: BearerAuth must not be published.");
  }

  assertStablePublicOperationIds(document);
}

function applyDocumentationExportEnv(): void {
  process.env.JWT_SECRET ??= "openapi-export-local-secret";
  process.env.CORS_ORIGIN ??= "http://localhost:3000,http://localhost:4321";
  process.env.ALLOWED_ORIGINS ??=
    "https://musiccloud.io,http://localhost:3000,http://localhost:4321,http://localhost:4322";
  process.env.JAMENDO_MIN_GAP_MS ??= "0";
}

/**
 * Exports the same finalized public contract served by `/docs/json`.
 *
 * The exporter builds the local app, injects the public JSON endpoint, validates
 * public-only invariants, and closes server/database resources so CLI builds
 * terminate cleanly after writing the artifact.
 */
export async function exportPublicOpenApiContract(): Promise<PublicOpenApiExport> {
  applyDocumentationExportEnv();

  const { buildApp } = await import("../server.js");
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const contentType = String(response.headers["content-type"] ?? "");
    if (response.statusCode !== 200) {
      throw new Error(`OpenAPI export failed: ${response.statusCode}`);
    }
    if (!contentType.includes("application/json")) {
      throw new Error(`OpenAPI export failed: unexpected content-type ${contentType}`);
    }

    const document = response.json() as PublicOpenApiDocument;
    assertPublicContract(document);
    const json = stableStringify(document);
    return {
      document,
      json,
      sha256: createHash("sha256").update(json).digest("hex"),
      version: document.info.version,
    };
  } finally {
    await app.close();
    const [{ closeRuntimeDatabaseReadinessPool }, { closeRepository }] = await Promise.all([
      import("../db/runtime-database-readiness.js"),
      import("../db/index.js"),
    ]);
    await Promise.all([closeRuntimeDatabaseReadinessPool(), closeRepository()]);
  }
}

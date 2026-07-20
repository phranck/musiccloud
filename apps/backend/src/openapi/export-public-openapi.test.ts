import { MC_ERROR_CODE_PATTERN, PUBLIC_ERROR_CODE_CATALOG } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../server.js";
import { exportPublicOpenApiContract, type PublicOpenApiDocument, stableStringify } from "./export-public-openapi.js";

let app: FastifyInstance;

function findArrayTypePaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findArrayTypePaths(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const ownPath = Array.isArray(record.type) ? [path] : [];
  return [...ownPath, ...Object.entries(record).flatMap(([key, child]) => findArrayTypePaths(child, `${path}.${key}`))];
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-openapi-export";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("exportPublicOpenApiContract", () => {
  it("exports the same finalized public document served by /docs/json", async () => {
    const exported = await exportPublicOpenApiContract();
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const servedDocument = response.json() as { info: { version: string } };

    expect(response.statusCode).toBe(200);
    expect(exported.document).toEqual(servedDocument);
    expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.version).toBe(servedDocument.info.version);
    expect(exported.json).toBe(stableStringify(exported.document));
  });

  it("keeps internal and first-party implementation routes out of the export", async () => {
    const exported = await exportPublicOpenApiContract();
    const paths = Object.keys(exported.document.paths);

    for (const excluded of [
      "/api/admin",
      "/api/auth",
      "/api/dev",
      "/api/v1/content",
      "/api/v1/nav",
      "/api/v1/site-settings",
      "/api/v1/services",
      "/api/v1/random",
      "/api/v1/telemetry",
    ]) {
      expect(paths.filter((p) => p.startsWith(excluded))).toEqual([]);
    }
  });

  it("exports generator-compatible schemas without JSON Schema type arrays", async () => {
    const exported = await exportPublicOpenApiContract();

    expect(findArrayTypePaths(exported.document)).toEqual([]);
  });

  it("exports the canonical public error catalog and code pattern", async () => {
    const exported = await exportPublicOpenApiContract();
    const document = exported.document as PublicOpenApiDocument & {
      "x-musiccloud-error-codes"?: unknown;
    };
    const errorSchema = document.components?.schemas?.ErrorResponse as {
      properties?: { error?: { pattern?: string } };
    };

    expect(document["x-musiccloud-error-codes"]).toEqual(PUBLIC_ERROR_CODE_CATALOG);
    expect(errorSchema.properties?.error?.pattern).toBe(MC_ERROR_CODE_PATTERN.source);
  });
});

import { MC_ERROR_CODE_PATTERN, PUBLIC_ERROR_CODE_CATALOG } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../server.js";
import {
  assertStablePublicOperationIds,
  exportPublicOpenApiContract,
  type PublicOpenApiDocument,
  stableStringify,
} from "./export-public-openapi.js";

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

    expect(exported.document.openapi).toBe("3.1.0");
    expect(findArrayTypePaths(exported.document)).toEqual([]);
  });

  it("exports one stable semantic operation ID for every public operation", async () => {
    const exported = await exportPublicOpenApiContract();
    const actual: Record<string, string | undefined> = {};

    for (const [route, pathItem] of Object.entries(exported.document.paths)) {
      for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
        if (!/^(delete|get|head|options|patch|post|put|trace)$/.test(method)) continue;
        actual[`${method.toUpperCase()} ${route}`] = (operation as { operationId?: string }).operationId;
      }
    }

    expect(actual).toEqual({
      "GET /api/v1/artist-info": "retrieveArtistInfo",
      "GET /api/v1/cc/artist-info": "retrieveCcArtistInfo",
      "GET /api/v1/cc/audio/{jamendoId}": "streamCcAudio",
      "GET /api/v1/cc/bandcamp/{jamendoId}": "retrieveCcBandcampAvailability",
      "GET /api/v1/cc/download/{jamendoId}": "downloadCcAudio",
      "GET /api/v1/cc/genre-artwork/{genreKey}": "retrieveCcGenreArtwork",
      "POST /api/v1/cc/resolve": "resolveCc",
      "GET /api/v1/genre-artwork/{genreKey}": "retrieveGenreArtwork",
      "GET /api/v1/link/{id}": "retrieveLinkMetadata",
      "GET /api/v1/resolve": "resolvePublicQuery",
      "POST /api/v1/resolve": "resolve",
      "GET /api/v1/share/{shortId}": "retrieveShare",
      "GET /api/v1/share/{shortId}/preview": "refreshSharePreview",
    });
    expect(new Set(Object.values(actual)).size).toBe(Object.keys(actual).length);
  });

  it("rejects missing and duplicate public operation IDs before writing SDK inputs", () => {
    const document = {
      openapi: "3.0.3",
      info: { version: "1.0.0" },
      paths: {
        "/missing": { get: { responses: {} } },
        "/duplicate-a": { post: { operationId: "duplicate", responses: {} } },
        "/duplicate-b": { get: { operationId: "duplicate", responses: {} } },
      },
    };

    expect(() => assertStablePublicOperationIds(document)).toThrow(
      "OpenAPI export failed: missing operationId (GET /missing).",
    );
    (document.paths["/missing"].get as { operationId?: string }).operationId = "present";
    expect(() => assertStablePublicOperationIds(document)).toThrow(
      "OpenAPI export failed: duplicate operationId (duplicate).",
    );
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

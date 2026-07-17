import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../server.js";

let app: FastifyInstance;

type OpenApiSchema = Record<string, unknown>;

function isSchemaRecord(value: unknown): value is OpenApiSchema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schemaReferenceName(schema: unknown): string | undefined {
  if (!isSchemaRecord(schema) || typeof schema.$ref !== "string") return undefined;

  const prefix = "#/components/schemas/";
  return schema.$ref.startsWith(prefix) ? schema.$ref.slice(prefix.length) : undefined;
}

function collectTopLevelResponseSchemas(schema: unknown): string[] {
  const directReference = schemaReferenceName(schema);
  if (directReference) return [directReference];
  if (!isSchemaRecord(schema)) return [];

  return ["oneOf", "anyOf", "allOf"].flatMap((keyword) => {
    const variants = schema[keyword];
    if (!Array.isArray(variants)) return [];
    return variants.flatMap((variant) => {
      const reference = schemaReferenceName(variant);
      return reference ? [reference] : [];
    });
  });
}

function findUndocumentedResponseFields(schemas: Record<string, unknown>, roots: string[]): string[] {
  const missing: string[] = [];
  const visitedReferences = new Set<string>();

  const visitSchema = (value: unknown, path: string): void => {
    const reference = schemaReferenceName(value);
    if (reference) {
      if (visitedReferences.has(reference)) return;
      visitedReferences.add(reference);
      visitSchema(schemas[reference], reference);
      return;
    }
    if (!isSchemaRecord(value)) return;

    const properties = value.properties;
    if (isSchemaRecord(properties)) {
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        const propertyPath = `${path}.${propertyName}`;
        if (
          !isSchemaRecord(propertySchema) ||
          typeof propertySchema.description !== "string" ||
          !propertySchema.description.trim()
        ) {
          missing.push(propertyPath);
        }
        visitSchema(propertySchema, propertyPath);
      }
    }

    if (value.items !== undefined) visitSchema(value.items, `${path}[]`);
    for (const keyword of ["oneOf", "anyOf", "allOf"]) {
      const variants = value[keyword];
      if (!Array.isArray(variants)) continue;
      for (const variant of variants) visitSchema(variant, path);
    }
  };

  for (const root of roots) {
    if (visitedReferences.has(root)) continue;
    visitedReferences.add(root);
    visitSchema(schemas[root], root);
  }

  return missing.sort();
}

function findAmbiguousResponsePresenceDescriptions(schemas: Record<string, unknown>, roots: string[]): string[] {
  const ambiguous: string[] = [];
  const visitedReferences = new Set<string>();

  const allowsNull = (value: unknown): boolean => {
    if (!isSchemaRecord(value)) return false;
    if (value.nullable === true || value.type === "null") return true;
    return ["oneOf", "anyOf"].some((keyword) => {
      const variants = value[keyword];
      return Array.isArray(variants) && variants.some(allowsNull);
    });
  };

  const visitSchema = (value: unknown, path: string): void => {
    const reference = schemaReferenceName(value);
    if (reference) {
      if (visitedReferences.has(reference)) return;
      visitedReferences.add(reference);
      visitSchema(schemas[reference], reference);
      return;
    }
    if (!isSchemaRecord(value)) return;

    const required = new Set(
      Array.isArray(value.required) ? value.required.filter((key): key is string => typeof key === "string") : [],
    );
    const properties = value.properties;
    if (isSchemaRecord(properties)) {
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        const propertyPath = `${path}.${propertyName}`;
        const description =
          isSchemaRecord(propertySchema) && typeof propertySchema.description === "string"
            ? propertySchema.description
            : "";
        if (!required.has(propertyName) && !/the key is omitted/i.test(description)) {
          ambiguous.push(`${propertyPath}: optional key lacks an omission condition`);
        }
        if (required.has(propertyName) && allowsNull(propertySchema) && !/always included/i.test(description)) {
          ambiguous.push(`${propertyPath}: nullable included key lacks explicit presence wording`);
        }
        visitSchema(propertySchema, propertyPath);
      }
    }

    if (value.items !== undefined) visitSchema(value.items, `${path}[]`);
    for (const keyword of ["oneOf", "anyOf", "allOf"]) {
      const variants = value[keyword];
      if (!Array.isArray(variants)) continue;
      for (const variant of variants) visitSchema(variant, path);
    }
  };

  for (const root of roots) {
    if (visitedReferences.has(root)) continue;
    visitedReferences.add(root);
    visitSchema(schemas[root], root);
  }

  return ambiguous.sort();
}

function findInvalidDefaultDescriptions(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findInvalidDefaultDescriptions(entry, `${path}[${index}]`));
  }
  if (!isSchemaRecord(value)) return [];

  return Object.entries(value).flatMap(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    if (key === "description" && typeof entry === "string" && entry.includes("Default")) {
      const remainingText = entry.replaceAll("\n\n**Default**:", "");
      return remainingText.includes("Default") ? [entryPath] : [];
    }
    return findInvalidDefaultDescriptions(entry, entryPath);
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-openapi-docs";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("OpenAPI docs", () => {
  const responseStatuses = (doc: { paths: Record<string, unknown> }, method: string, route: string): string[] => {
    const path = doc.paths[route] as Record<string, { responses?: Record<string, unknown> }> | undefined;
    return Object.keys(path?.[method.toLowerCase()]?.responses ?? {}).sort();
  };

  it("redirects the retired backend reference to the Developer Portal", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });

    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe("https://developer.musiccloud.io/docs/api");
  });

  it("serves the finalized public contract with a bounded public cache policy", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      info: { version: string; description: string };
      paths: Record<string, unknown>;
      components: {
        schemas: Record<string, { properties: Record<string, unknown> }>;
        securitySchemes: Record<string, unknown>;
      };
    };

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    // Every immutable SDK release is keyed by the public contract version.
    // Keep this assertion explicit so a contract change cannot reuse a tag.
    expect(doc.info.version).toBe("2.1.6");
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(doc.paths)).not.toContain("/api/dev/api-access/clients");
    expect(doc.components.securitySchemes).toHaveProperty("ApiKeyAuth");
    expect(doc.components.securitySchemes).not.toHaveProperty("BearerAuth");
    expect(doc.components.schemas.CcArtistProfile.properties.followers).toEqual({
      type: "integer",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; Jamendo artist-info exposes no compatible follower count.",
    });
    expect(doc.components.schemas.CcArtistTopTrack.properties.shortId).toEqual({
      type: "string",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; this response does not perform share-code lookup for its track rows. Resolve `deezerUrl` through `POST /api/v1/cc/resolve` to obtain a share code.",
    });
    expect(doc.info.description).toContain("X-API-Key: mc_live_");
    expect(doc.info.description).not.toContain("/api/auth/token");
    expect(doc.info.description).not.toContain("client_credentials");
  });

  it("does not expose the retired OAuth token route in the public contract", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, unknown> };

    expect(res.statusCode).toBe(200);
    expect(Object.keys(doc.paths)).not.toContain("/api/auth/token");
  });

  it("exports exactly the approved public API paths and keeps hidden runtime routes registered", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      paths: Record<string, unknown>;
      tags?: Array<{ name: string }>;
      components?: { schemas?: Record<string, unknown> };
    };

    expect(res.statusCode).toBe(200);
    expect(Object.keys(doc.paths)).toEqual([
      "/api/v1/artist-info",
      "/api/v1/cc/artist-info",
      "/api/v1/cc/audio/{jamendoId}",
      "/api/v1/cc/bandcamp/{jamendoId}",
      "/api/v1/cc/download/{jamendoId}",
      "/api/v1/cc/genre-artwork/{genreKey}",
      "/api/v1/cc/resolve",
      "/api/v1/genre-artwork/{genreKey}",
      "/api/v1/link/{id}",
      "/api/v1/resolve",
      "/api/v1/share/{shortId}",
      "/api/v1/share/{shortId}/preview",
    ]);

    expect(app.hasRoute({ method: "GET", url: "/api/v1/tiers" })).toBe(true);
    expect(app.hasRoute({ method: "GET", url: "/api/v1/cc/random-example" })).toBe(true);
    expect(app.hasRoute({ method: "GET", url: "/health/backend" })).toBe(true);

    expect(doc.tags?.map((tag) => tag.name)).not.toContain("Health");
    expect(doc.tags?.map((tag) => tag.name)).not.toContain("Plans");
    expect(doc.components?.schemas).not.toHaveProperty("HealthStatusResponse");
    expect(doc.components?.schemas).not.toHaveProperty("PublicTier");
    expect(doc.components?.schemas).not.toHaveProperty("CcRandomExampleResponse");
  });

  it("does not register or publish Dynamic Forms", async () => {
    expect(app.hasRoute({ method: "POST", url: "/api/v1/forms/:slug/submit" })).toBe(false);
    expect(app.hasRoute({ method: "GET", url: "/api/admin/forms" })).toBe(false);
    expect(app.hasRoute({ method: "GET", url: "/api/admin/forms/:name" })).toBe(false);

    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json() as {
      paths: Record<string, unknown>;
      tags?: Array<{ name: string }>;
      components?: { schemas?: Record<string, unknown> };
    };

    expect(document.paths).not.toHaveProperty("/api/v1/forms/{slug}/submit");
    expect(document.tags?.map((tag) => tag.name)).not.toContain("Forms");
    expect(document.components?.schemas).not.toHaveProperty("FormSubmissionSuccessResponse");
    expect(document.components?.schemas).not.toHaveProperty("FormSubmissionErrorResponse");
  });

  it("gives every public operation parameter an actionable description", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, Record<string, unknown>> };
    const descriptions: Record<string, string> = {};

    expect(res.statusCode).toBe(200);

    for (const [route, pathItem] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;

        const parameters =
          (operation as { parameters?: Array<{ description?: string; in: string; name: string }> }).parameters ?? [];
        for (const parameter of parameters) {
          const context = `${method.toUpperCase()} ${route} ${parameter.in} parameter \`${parameter.name}\``;
          const description = parameter.description?.trim() ?? "";

          expect(description, context).not.toBe("");
          expect(description.split(/\s+/).length, context).toBeGreaterThanOrEqual(4);
          descriptions[`${method.toUpperCase()} ${route} ${parameter.in} ${parameter.name}`] = description;
        }
      }
    }

    expect(descriptions).toMatchObject({
      "GET /api/v1/artist-info query shortId":
        "Optional musiccloud track share code. Take the last path segment of `shortUrl` from a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. When the share's stored service links identify an alternate artist known to musiccloud, that name replaces `name` for this lookup. Otherwise `name` is used unchanged after normalization.\n\n**Default**: the supplied `name` is used directly, with no persisted-resolution context.",
      "GET /api/v1/cc/artist-info query jamendoArtistId":
        "Numeric Jamendo artist ID. Read `track.jamendoArtistId`, `album.tracks[].jamendoArtistId`, or `artist.jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
      "GET /api/v1/cc/artist-info query artistName":
        "Display label for the artist identified by `jamendoArtistId`. Read it from `track.artistName`, `album.artistName`, or `artist.name` in the same response as the ID. The ID, not this name, controls which Jamendo artist, profile, and tracks are fetched; the supplied string is returned as `artistName`.",
      "GET /api/v1/cc/audio/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId`, `album.tracks[].jamendoId`, or `artist.topTracks[].jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
      "GET /api/v1/cc/bandcamp/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId`, `album.tracks[].jamendoId`, or `artist.topTracks[].jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
      "GET /api/v1/cc/download/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId`, `album.tracks[].jamendoId`, or `artist.topTracks[].jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
      "GET /api/v1/link/{id} path id":
        "Persisted musiccloud track ID from the top-level `id` field of a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve` with `format=json`.",
      "GET /api/v1/share/{shortId} path shortId":
        "Public musiccloud share code: take the last path segment of `shortUrl` from a successful `POST /api/v1/resolve`, `GET /api/v1/resolve`, or `POST /api/v1/cc/resolve` response.",
      "GET /api/v1/share/{shortId}/preview path shortId":
        "Track share code: take the last path segment of `shortUrl` from a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. Album, artist, and Creative Commons share codes are not accepted.",
    });
  });

  it("gives every public operation, request body, and response a developer-facing description", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, Record<string, unknown>> };

    expect(res.statusCode).toBe(200);

    for (const [route, pathItem] of Object.entries(doc.paths)) {
      for (const [method, rawOperation] of Object.entries(pathItem)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;
        const context = `${method.toUpperCase()} ${route}`;
        const operation = rawOperation as {
          description?: string;
          requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
          responses?: Record<string, { description?: string; headers?: Record<string, OpenApiSchema> }>;
          summary?: string;
        };

        expect(operation.summary?.trim(), `${context} summary`).not.toBe("");
        expect(operation.description?.trim(), `${context} description`).not.toBe("");

        for (const [mediaType, media] of Object.entries(operation.requestBody?.content ?? {})) {
          const bodyContext = `${context} ${mediaType} request body`;
          expect(media.schema?.description?.trim(), bodyContext).not.toBe("");
          if (isSchemaRecord(media.schema?.properties)) {
            for (const [property, schema] of Object.entries(media.schema.properties)) {
              expect(
                isSchemaRecord(schema) && typeof schema.description === "string" ? schema.description.trim() : "",
                `${bodyContext} property ${property}`,
              ).not.toBe("");
            }
          }
        }

        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          expect(response.description?.trim(), `${context} response ${status}`).not.toBe("");
          for (const [headerName, header] of Object.entries(response.headers ?? {})) {
            expect(header.description, `${context} response ${status} header ${headerName}`).toEqual(
              expect.any(String),
            );
            expect(header, `${context} response ${status} header ${headerName}`).not.toHaveProperty("schema.schema");
          }
        }
      }
    }
  });

  it("documents the effective default for every optional public parameter", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, Record<string, unknown>> };
    const descriptions: Record<string, string> = {};

    expect(res.statusCode).toBe(200);

    for (const [route, pathItem] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;

        const parameters =
          (operation as { parameters?: Array<{ description?: string; in: string; name: string; required?: boolean }> })
            .parameters ?? [];
        for (const parameter of parameters) {
          if (parameter.required === true) continue;
          descriptions[`${method.toUpperCase()} ${route} ${parameter.in} ${parameter.name}`] =
            parameter.description?.trim() ?? "";
        }
      }
    }

    const expectedDefaultDescriptions = {
      "GET /api/v1/artist-info query region":
        "\n\n**Default**: no country is prioritized and events remain in ascending date order.",
      "GET /api/v1/artist-info query shortId":
        "\n\n**Default**: the supplied `name` is used directly, with no persisted-resolution context.",
      "GET /api/v1/artist-info query refresh":
        "\n\n**Default**: profile metadata is fetched when no stored snapshot exists or its snapshot is at least `183` days old.",
      "GET /api/v1/cc/audio/{jamendoId} query format": "\n\n**Default**: `mp32`.",
      "GET /api/v1/cc/download/{jamendoId} query format": "\n\n**Default**: `mp32`.",
      "GET /api/v1/resolve query format": "\n\n**Default**: `json`.",
    };

    for (const [parameter, expectedDescription] of Object.entries(expectedDefaultDescriptions)) {
      expect(descriptions[parameter], parameter).toContain(expectedDescription);
    }
  });

  it("starts every documented default in its own Markdown paragraph", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as Record<string, unknown>;

    expect(res.statusCode).toBe(200);
    expect(findInvalidDefaultDescriptions(doc)).toEqual([]);
  });

  it("documents every global rate-limit response and each explicit public response branch", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, unknown> };

    expect(res.statusCode).toBe(200);

    for (const [route, pathItem] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;
        expect(
          (operation as { responses?: Record<string, unknown> }).responses,
          `${method.toUpperCase()} ${route}`,
        ).toHaveProperty("429");
        expect(
          (operation as { responses?: Record<string, unknown> }).responses,
          `${method.toUpperCase()} ${route}`,
        ).toHaveProperty("500");
      }
    }

    const expected: Record<string, string[]> = {
      "GET /api/v1/cc/artist-info": ["200", "400", "429", "500"],
      "GET /api/v1/cc/audio/{jamendoId}": ["200", "206", "400", "404", "429", "500", "502"],
      "GET /api/v1/cc/bandcamp/{jamendoId}": ["200", "400", "429", "500"],
      "GET /api/v1/cc/download/{jamendoId}": ["200", "400", "403", "404", "429", "500", "502"],
      "GET /api/v1/cc/genre-artwork/{genreKey}": ["200", "400", "429", "500"],
      "GET /api/v1/genre-artwork/{genreKey}": ["200", "400", "429", "500"],
    };

    for (const [operation, statuses] of Object.entries(expected)) {
      const [method, route] = operation.split(" ", 2);
      expect(responseStatuses(doc, method ?? "", route ?? ""), operation).toEqual(statuses);
    }
  });

  it("documents structured search completely on resolve endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      paths: {
        "/api/v1/resolve": {
          get: { description: string; parameters: Array<{ name: string; schema?: { examples?: string[] } }> };
          post: { description: string; requestBody: { content: { "application/json": { schema: unknown } } } };
        };
      };
    };

    expect(res.statusCode).toBe(200);

    const getResolve = doc.paths["/api/v1/resolve"].get;
    const postResolve = doc.paths["/api/v1/resolve"].post;
    const combinedDescriptions = `${getResolve.description}\n${postResolve.description}`;

    for (const text of [
      "starts with `title:`, `artist:`, or `album:`",
      "resolves tracks only",
      "`count:` — optional integer from `1` to `10`",
      "A missing comma before the next known field is tolerated",
      "Commas are field separators and are not escaped",
      "Duplicate fields, empty values, unknown fields",
      "`genre:`, `tracks:`, `albums:`, `artists:`, and `vibe:` are rejected here",
      "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
    ]) {
      expect(combinedDescriptions).toContain(text);
    }

    expect(postResolve.description).toContain(
      "Send the chosen `candidates[].id` back as `selectedCandidate` to the same endpoint",
    );
    expect(getResolve.description).toContain("Ambiguous structured searches therefore return `400`");
    expect(combinedDescriptions).not.toContain("docs/resolve-flow");

    const queryParameter = getResolve.parameters.find((parameter) => parameter.name === "query");
    expect(queryParameter).toBeDefined();
    expect(JSON.stringify(queryParameter)).toContain("structured search query");
  });

  it("never exposes internal surfaces (admin, developer-portal) in the public OpenAPI doc", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { paths: Record<string, unknown> };

    expect(res.statusCode).toBe(200);

    const paths = Object.keys(doc.paths);
    // The developer-portal account API (`/api/dev/*`) and the admin API
    // (`/api/admin/*`) are first-party surfaces, not part of the published
    // REST contract. They are reachable but must never be advertised.
    const leakedDev = paths.filter((p) => p.startsWith("/api/dev"));
    const leakedAdmin = paths.filter((p) => p.startsWith("/api/admin"));

    expect(leakedDev).toEqual([]);
    expect(leakedAdmin).toEqual([]);
  });

  it("lists tags, paths, and schemas alphabetically", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      tags: Array<{ name: string }>;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };

    expect(res.statusCode).toBe(200);

    const tagNames = doc.tags.map((t) => t.name);
    const pathKeys = Object.keys(doc.paths);
    const schemaKeys = Object.keys(doc.components.schemas);

    expect(tagNames).toEqual([...tagNames].sort((a, b) => a.localeCompare(b)));
    expect(pathKeys).toEqual([...pathKeys].sort((a, b) => a.localeCompare(b)));
    expect(schemaKeys).toEqual([...schemaKeys].sort((a, b) => a.localeCompare(b)));
  });

  it("does not leak internal-only schemas whose endpoints are hidden", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as { components: { schemas: Record<string, unknown> } };

    expect(res.statusCode).toBe(200);

    // These models back hidden routes (services, nav, content) and must not
    // appear in the public reference — they were leaking as orphan schemas.
    for (const internal of [
      "ActiveService",
      "NavItem",
      "PublicContentPage",
      "PublicPageSegment",
      "ContentPageSummary",
    ]) {
      expect(doc.components.schemas).not.toHaveProperty(internal);
    }
  });

  it("uses real service ids in generated OpenAPI examples", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const docJson = res.body;

    expect(res.statusCode).toBe(200);
    expect(docJson).not.toContain("appleMusic");
    expect(docJson).toContain("apple-music");
    expect(docJson).toContain("spotify:2WfaOiMkCvy7F5fcp2zZ8L");
    expect(docJson).not.toContain("spotify:track:2WfaOiMkCvy7F5fcp2zZ8L");
  });

  it("gives every successful JSON response object a named, linkable schema", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      components: { schemas: Record<string, unknown> };
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    };
    const responseSchemaNames: Record<string, string[]> = {};

    expect(res.statusCode).toBe(200);

    for (const [route, pathItem] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;

        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (!status.startsWith("2")) continue;
          const schema = (
            response as {
              content?: { "application/json"?: { schema?: Record<string, unknown> } };
            }
          ).content?.["application/json"]?.schema;
          if (!schema) continue;

          const directReference = typeof schema.$ref === "string" ? schema.$ref : undefined;
          const composedReferences = ["oneOf", "anyOf", "allOf"].flatMap((keyword) => {
            const variants = schema[keyword];
            if (!Array.isArray(variants)) return [];
            return variants.flatMap((variant) =>
              variant && typeof variant === "object" && typeof (variant as { $ref?: unknown }).$ref === "string"
                ? [(variant as { $ref: string }).$ref]
                : [],
            );
          });
          const references = directReference ? [directReference] : composedReferences;
          const returnsObject =
            directReference !== undefined || schema.type === "object" || composedReferences.length > 0;
          if (!returnsObject) continue;

          const context = `${method.toUpperCase()} ${route} ${status}`;
          expect(references, `${context} must expose a reusable response-object schema`).not.toEqual([]);

          const names = references.map((reference) => reference.replace("#/components/schemas/", ""));
          for (const name of names) {
            expect(doc.components.schemas, `${context} schema ${name}`).toHaveProperty(name);
          }
          responseSchemaNames[context] = names;
        }
      }
    }

    expect(responseSchemaNames).toMatchObject({
      "GET /api/v1/cc/bandcamp/{jamendoId} 200": ["CcBandcampAvailabilityResponse"],
      "GET /api/v1/link/{id} 200": ["LinkMetadataResponse"],
      "GET /api/v1/share/{shortId}/preview 200": ["SharePreviewResponse"],
    });
  });

  it("documents every field reachable from a public JSON response object", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      components: { schemas: Record<string, unknown> };
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    };
    const responseRoots = new Set<string>();

    expect(res.statusCode).toBe(200);

    for (const pathItem of Object.values(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!/^(get|post|put|patch|delete|options|head)$/.test(method)) continue;

        for (const response of Object.values(operation.responses ?? {})) {
          const schema = (
            response as {
              content?: { "application/json"?: { schema?: unknown } };
            }
          ).content?.["application/json"]?.schema;
          for (const root of collectTopLevelResponseSchemas(schema)) responseRoots.add(root);
        }
      }
    }

    expect([...responseRoots]).not.toEqual([]);
    expect(findUndocumentedResponseFields(doc.components.schemas, [...responseRoots])).toEqual([]);
    expect(findAmbiguousResponsePresenceDescriptions(doc.components.schemas, [...responseRoots])).toEqual([]);
  });

  it("explains how clients consume the Creative Commons audio stream", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      paths: {
        "/api/v1/cc/audio/{jamendoId}": {
          get: { description: string; responses: Record<string, { description: string }> };
        };
      };
    };

    expect(res.statusCode).toBe(200);

    const audioOperation = doc.paths["/api/v1/cc/audio/{jamendoId}"].get;
    expect(audioOperation.description).toContain("raw audio bytes, not JSON");
    expect(audioOperation.description).toContain("<audio");
    expect(audioOperation.description).toContain("response.body");
    expect(audioOperation.description).toContain("Range");
    expect(audioOperation.description).toContain("Accept-Ranges");
    expect(audioOperation.responses["200"].description).toContain("full raw audio stream");
    expect(audioOperation.responses["206"].description).toContain("Content-Range");
  });

  it("documents the actual media type and transport headers of binary responses", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      paths: Record<
        string,
        {
          get: {
            parameters?: Array<{ in: string; name: string }>;
            responses: Record<string, { content?: Record<string, unknown>; headers?: Record<string, unknown> }>;
          };
        }
      >;
    };

    expect(res.statusCode).toBe(200);

    const audio = doc.paths["/api/v1/cc/audio/{jamendoId}"]?.get;
    expect(audio?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ in: "header", name: "range" })]),
    );
    expect(Object.keys(audio?.responses["200"]?.content ?? {}).sort()).toEqual([
      "audio/flac",
      "audio/mpeg",
      "audio/ogg",
    ]);
    expect(Object.keys(audio?.responses["206"]?.content ?? {}).sort()).toEqual([
      "audio/flac",
      "audio/mpeg",
      "audio/ogg",
    ]);
    expect(audio?.responses["200"]?.headers).toHaveProperty("Accept-Ranges");
    expect(audio?.responses["206"]?.headers).toHaveProperty("Content-Range");
    expect(audio?.responses["200"]?.headers?.["Accept-Ranges"]).toMatchObject({
      schema: { type: "string", enum: ["bytes"] },
    });
    expect(audio?.responses["200"]?.headers?.["Accept-Ranges"]).not.toHaveProperty("schema.schema");

    const download = doc.paths["/api/v1/cc/download/{jamendoId}"]?.get.responses["200"];
    expect(Object.keys(download?.content ?? {}).sort()).toEqual(["audio/flac", "audio/mpeg", "audio/ogg"]);
    expect(download?.headers).toHaveProperty("Content-Disposition");
    expect(download?.headers?.["Content-Disposition"]).toMatchObject({ schema: { type: "string" } });
    expect(download?.headers?.["Content-Disposition"]).not.toHaveProperty("schema.schema");

    for (const route of ["/api/v1/genre-artwork/{genreKey}", "/api/v1/cc/genre-artwork/{genreKey}"]) {
      const artwork = doc.paths[route]?.get.responses["200"];
      expect(Object.keys(artwork?.content ?? {}), route).toEqual(["image/jpeg"]);
      expect(artwork?.headers, route).toHaveProperty("Cache-Control");
      expect(artwork?.headers?.["Cache-Control"], route).toMatchObject({ schema: { type: "string" } });
      expect(artwork?.headers?.["Cache-Control"], route).not.toHaveProperty("schema.schema");
    }
  });

  it("models every successful public response with its exact runtime variant", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      components: { schemas: Record<string, OpenApiSchema> };
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: { content: { "application/json": { schema: OpenApiSchema } } };
            responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>;
          }
        >
      >;
    };

    expect(res.statusCode).toBe(200);

    const getResolve = doc.paths["/api/v1/resolve"]?.get?.responses?.["200"]?.content;
    expect(getResolve).toHaveProperty("application/json");
    expect(getResolve).toHaveProperty("text/plain");

    for (const route of ["/api/v1/resolve", "/api/v1/cc/resolve"]) {
      const body = doc.paths[route]?.post?.requestBody?.content?.["application/json"]?.schema;
      expect(body, route).toHaveProperty("oneOf");
      expect(body, route).not.toHaveProperty("anyOf");
    }

    expect(doc.components.schemas).toHaveProperty("CcArtistInfo");
    expect(doc.components.schemas).toHaveProperty("TrackSharePageResponse");
    expect(doc.components.schemas).toHaveProperty("AlbumSharePageResponse");
    expect(doc.components.schemas).toHaveProperty("ArtistSharePageResponse");
    expect(doc.components.schemas).not.toHaveProperty("CommercialTrackSharePageResponse");
    expect(doc.components.schemas).not.toHaveProperty("CommercialAlbumSharePageResponse");
    expect(doc.components.schemas).not.toHaveProperty("CommercialArtistSharePageResponse");
    expect(doc.components.schemas.SharePage?.oneOf).toHaveLength(6);
    expect(doc.components.schemas.SharePage?.oneOf).toEqual(
      expect.arrayContaining([
        { $ref: "#/components/schemas/TrackSharePageResponse" },
        { $ref: "#/components/schemas/AlbumSharePageResponse" },
        { $ref: "#/components/schemas/ArtistSharePageResponse" },
      ]),
    );
    expect(doc.components.schemas.Album?.required).toContain("vinylLayout");
    expect(doc.components.schemas.CcAlbum?.required).toContain("vinylLayout");
    expect(doc.components.schemas.CcGenreTile?.properties as OpenApiSchema | undefined).not.toHaveProperty(
      "accentColor",
    );
    expect(doc.components.schemas.SharePage?.description).toContain("`cc-track` carries only `track`");
    expect(doc.components.schemas.SharePreviewResponse?.properties).toMatchObject({
      previewUrl: { anyOf: expect.arrayContaining([{ type: "string", format: "uri" }]) },
    });
  });

  it("uses developer-facing descriptions without hidden dashboard or provider-configuration assumptions", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json() as {
      info: { description: string };
      components: { schemas: Record<string, unknown> };
      paths: Record<string, unknown>;
    };
    const publicContract = JSON.stringify(doc);

    expect(res.statusCode).toBe(200);
    for (const forbidden of [
      "when Last.fm is configured",
      "when Spotify credentials are configured",
      "when Deezer is configured",
      "configured quota",
      "internal track ID",
      "frontend proxy",
    ]) {
      expect(publicContract, forbidden).not.toContain(forbidden);
    }

    expect(doc.info.description).toContain("https://developer.musiccloud.io/dashboard/api-access");
    expect(doc.info.description).toContain("https://developer.musiccloud.io/dashboard/api-keys");
    expect(publicContract).toContain("accepted by `GET /api/v1/link/{id}`");
    expect(publicContract).toContain("Pass it as `selectedCandidate` to `POST /api/v1/cc/resolve`");
    expect(publicContract).toContain("The key is always included");
    expect(publicContract).toContain("The key is omitted");
  });
});

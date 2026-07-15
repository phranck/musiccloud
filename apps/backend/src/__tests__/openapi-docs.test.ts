import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../server.js";

let app: FastifyInstance;

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
      components: { securitySchemes: Record<string, unknown> };
    };

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    // Every immutable SDK release is keyed by the public contract version.
    // Keep this assertion explicit so a contract change cannot reuse a tag.
    expect(doc.info.version).toBe("2.1.3");
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(doc.paths)).not.toContain("/api/dev/api-access/clients");
    expect(doc.components.securitySchemes).toHaveProperty("ApiKeyAuth");
    expect(doc.components.securitySchemes).not.toHaveProperty("BearerAuth");
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
        "Optional musiccloud track share code. Take the last path segment of `shortUrl` from a successful `POST /api/v1/resolve` track response; it supplies context for ambiguous artist names.",
      "GET /api/v1/artist-info query artistEntityId":
        "Reserved for future context-aware artist-info lookups. No public endpoint currently returns or uses it, so omit this parameter.",
      "GET /api/v1/cc/artist-info query jamendoArtistId":
        "Numeric Jamendo artist ID. Read `track.jamendoArtistId` from a `cc-track` result, or `artist.jamendoId` from a `cc-artist` result, of `POST /api/v1/cc/resolve`.",
      "GET /api/v1/cc/artist-info query artistName":
        "Jamendo display name for the same artist. Used as the artist-column label and for profile and similar-track lookups.",
      "GET /api/v1/cc/audio/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId` from a `cc-track` result or an item in `album.tracks` or `artist.topTracks` from `POST /api/v1/cc/resolve`.",
      "GET /api/v1/cc/bandcamp/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId` from a `cc-track` result or an item in `album.tracks` or `artist.topTracks` from `POST /api/v1/cc/resolve`.",
      "GET /api/v1/cc/download/{jamendoId} path jamendoId":
        "Numeric Jamendo track ID. Read `track.jamendoId` from a `cc-track` result or an item in `album.tracks` or `artist.topTracks` from `POST /api/v1/cc/resolve`.",
      "POST /api/v1/forms/{slug}/submit path slug":
        "URL-safe slug of the active published form that receives this submission.",
      "GET /api/v1/link/{id} path id":
        "Internal track ID from the top-level `id` field of a successful track response from `POST /api/v1/resolve`.",
      "GET /api/v1/share/{shortId} path shortId":
        "Public musiccloud share code: take the last path segment of `shortUrl` from a successful `POST /api/v1/resolve` or `POST /api/v1/cc/resolve` response.",
      "GET /api/v1/share/{shortId}/preview path shortId":
        "Track share code: take the last path segment of `shortUrl` from a successful track response to `POST /api/v1/resolve`. Album, artist, and CC share codes are not accepted.",
    });
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
      }
    }

    const expected: Record<string, string[]> = {
      "GET /api/v1/cc/artist-info": ["200", "400", "429"],
      "GET /api/v1/cc/audio/{jamendoId}": ["200", "206", "400", "404", "429", "502"],
      "GET /api/v1/cc/bandcamp/{jamendoId}": ["200", "400", "429"],
      "GET /api/v1/cc/download/{jamendoId}": ["200", "400", "403", "404", "429", "502"],
      "GET /api/v1/cc/genre-artwork/{genreKey}": ["200", "400", "429"],
      "POST /api/v1/forms/{slug}/submit": ["200", "400", "404", "429"],
      "GET /api/v1/genre-artwork/{genreKey}": ["200", "400", "429"],
      "GET /api/v1/tiers": ["200", "429"],
      "GET /health/backend": ["200", "429"],
      "GET /health/dashboard": ["200", "429", "503"],
      "GET /health/db": ["200", "429", "503"],
      "GET /health/developer": ["200", "429", "503"],
      "GET /health/email": ["200", "429", "503"],
      "GET /health/frontend": ["200", "429", "503"],
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
      "`count:` — optional integer from 1 to 10",
      "A missing comma before the next known field is tolerated",
      "Commas are field separators and are not escaped",
      "Duplicate fields, empty values, unknown fields",
      "`genre:`, `tracks:`, `albums:`, `artists:`, and `vibe:` are rejected here",
      "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
    ]) {
      expect(combinedDescriptions).toContain(text);
    }

    expect(postResolve.description).toContain("Send the chosen candidate id back as `selectedCandidate`");
    expect(getResolve.description).toContain("Ambiguous structured searches therefore return 400");
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
});

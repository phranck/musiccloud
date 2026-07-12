import { existsSync } from "node:fs";
import path from "node:path";
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
    expect(combinedDescriptions).toContain("docs/resolve-flow/de/resolve-flow.pdf");
    expect(combinedDescriptions).toContain("docs/resolve-flow/en/resolve-flow.pdf");
    expect(existsSync(path.resolve(process.cwd(), "../..", "docs/resolve-flow/de/resolve-flow.pdf"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "../..", "docs/resolve-flow/en/resolve-flow.pdf"))).toBe(true);

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

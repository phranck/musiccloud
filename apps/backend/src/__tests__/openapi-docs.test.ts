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
  it("serves Scalar API reference at /docs", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    const html = res.body;

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-security-policy"]).toContain("cdn.jsdelivr.net");
    expect(res.headers["content-security-policy"]).toContain("https://api.musiccloud.io");
    expect(html).toContain("Scalar.createApiReference");
    expect(html).toContain('"url": "/docs/json"');
    expect(html).toContain('"theme": "none"');
    expect(html).toContain('"hideDarkModeToggle": false');
    expect(html).toContain('"withDefaultFonts": false');
    expect(html).toContain('@import url("/fonts/fonts.css")');
    expect(html).toContain("--scalar-color-accent: #259dff");
    expect(html).toContain("--lmaa-doc-header-height: 56px");
    expect(html).toContain('content: "musiccloud API"');
    expect(html).toContain("musiccloud.io");
    expect(html).not.toContain("Redoc.init");
    expect(html).not.toContain("redoc.standalone.js");
    expect(html).not.toContain("swagger-ui");
  });

  it("serves local docs fonts referenced by the lmaa Scalar CSS", async () => {
    const css = await app.inject({ method: "GET", url: "/fonts/fonts.css" });
    const font = await app.inject({ method: "GET", url: "/fonts/barlow-condensed-600.woff2" });

    expect(css.statusCode).toBe(200);
    expect(css.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(css.body).toContain('font-family: "Barlow Condensed"');
    expect(css.body).toContain("/fonts/barlow-condensed-600.woff2");

    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toBe("font/woff2");
    expect(Buffer.byteLength(font.body)).toBeGreaterThan(0);
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

    const queryParameter = getResolve.parameters.find((parameter) => parameter.name === "query");
    expect(queryParameter).toBeDefined();
    expect(JSON.stringify(queryParameter)).toContain("structured search query");
  });
});

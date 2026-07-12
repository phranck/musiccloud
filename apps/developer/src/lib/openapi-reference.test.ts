import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildApiReference } from "./openapi-reference";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

describe("buildApiReference", () => {
  it("builds a stable display model from the public OpenAPI document", () => {
    const reference = buildApiReference(readFixture("public-openapi.json"));

    expect(reference.version).toBe("2.1.0");
    expect(reference.auth).toEqual({ headerName: "X-API-Key", scheme: "ApiKeyAuth" });
    expect(reference.groups.map((group) => group.name)).toEqual(["Creative Commons", "Resolve"]);
    expect(reference.groups[1]).toMatchObject({
      name: "Resolve",
      operations: [
        {
          method: "GET",
          path: "/api/v1/resolve",
          navTitle: "Quick resolve",
          summary: "Resolve a streaming URL without an API key",
          requiresApiKey: false,
        },
        {
          method: "POST",
          path: "/api/v1/resolve",
          navTitle: "Resolve link",
          summary: "Resolve a streaming URL",
          requiresApiKey: true,
        },
      ],
    });
    expect(reference.groups[1]?.operations[1]?.parameters).toContainEqual({
      name: "url",
      location: "query",
      required: true,
      description: "Source track URL.",
      schema: { type: "string", format: "uri" },
    });
    expect(reference.groups[1]?.operations[1]?.requestBody).toMatchObject({
      required: true,
      mediaTypes: [{ mediaType: "application/json", schemaRef: "ResolveRequest" }],
    });
    expect(reference.groups[1]?.operations[1]?.responses).toContainEqual({
      status: "401",
      description: "Missing, invalid, or revoked API key.",
      mediaTypes: [{ mediaType: "application/json", schemaRef: "ErrorResponse" }],
    });
    expect(reference.schemas.ResolveSuccess.anchor).toBe("schema-resolve-success");
  });

  it("uses the curated portal label when the contract has no navigation title", () => {
    const fixture = readFixture("public-openapi.json") as {
      paths: { "/api/v1/resolve": { post: Record<string, unknown> } };
    };
    delete fixture.paths["/api/v1/resolve"].post["x-nav-title"];

    const reference = buildApiReference(fixture);

    expect(reference.groups[1]?.operations[1]?.navTitle).toBe("Resolve link");
  });

  it("rejects a document without info.version", () => {
    const fixture = readFixture("public-openapi.json") as { info: Record<string, unknown> };
    delete fixture.info.version;

    expect(() => buildApiReference(fixture)).toThrow("info.version");
  });

  it("rejects unknown local schema refs", () => {
    const fixture = readFixture("public-openapi.json") as {
      paths: {
        "/api/v1/resolve": { post: { responses: { "200": { content: { "application/json": { schema: unknown } } } } } };
      };
    };
    fixture.paths["/api/v1/resolve"].post.responses["200"].content["application/json"].schema = {
      $ref: "#/components/schemas/MissingSchema",
    };

    expect(() => buildApiReference(fixture)).toThrow("MissingSchema");
  });

  it("rejects non-object path operations", () => {
    const fixture = readFixture("public-openapi.json") as { paths: { "/api/v1/resolve": { post: unknown } } };
    fixture.paths["/api/v1/resolve"].post = true;

    expect(() => buildApiReference(fixture)).toThrow("operation");
  });

  it("rejects public operations without the documented API-key scheme", () => {
    const fixture = readFixture("public-openapi.json") as {
      paths: { "/api/v1/resolve": { post: { security: Array<Record<string, unknown>> } } };
    };
    fixture.paths["/api/v1/resolve"].post.security = [{ BearerAuth: [] }];

    expect(() => buildApiReference(fixture)).toThrow("ApiKeyAuth");
  });
});

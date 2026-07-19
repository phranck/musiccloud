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
    const resolveGroup = reference.groups.find((group) => group.name === "Resolve");
    const quickResolve = resolveGroup?.operations.find(
      (operation) => operation.method === "GET" && operation.path === "/api/v1/resolve",
    );
    const resolve = resolveGroup?.operations.find(
      (operation) => operation.method === "POST" && operation.path === "/api/v1/resolve",
    );

    expect(reference.version).toBe("2.1.7");
    expect(reference.auth).toEqual({ headerName: "X-API-Key", scheme: "ApiKeyAuth" });
    expect(reference.groups.map((group) => group.name)).toEqual([
      "Artist",
      "Artwork",
      "CC",
      "Links",
      "Resolve",
      "Share",
    ]);
    expect(quickResolve).toMatchObject({
      method: "GET",
      path: "/api/v1/resolve",
      navTitle: "Quick resolve",
      summary: "Resolve a music URL or query (unauthenticated, GET)",
      requiresApiKey: false,
    });
    expect(resolve).toMatchObject({
      method: "POST",
      path: "/api/v1/resolve",
      navTitle: "Resolve link",
      summary: "Resolve a music URL, free-text query, genre-discovery query, or structured search query",
      requiresApiKey: true,
    });
    expect(quickResolve?.parameters).toContainEqual({
      name: "query",
      location: "query",
      required: true,
      description:
        "Streaming-service URL, free-text query, or structured search query (e.g. `title: Bohemian Rhapsody, artist: Queen`).",
      schema: { type: "string", minLength: 1, maxLength: 500 },
    });
    expect(resolve?.requestBody).toMatchObject({
      required: true,
      mediaTypes: [
        {
          mediaType: "application/json",
          schema: {
            oneOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          },
        },
      ],
    });
    expect(resolve?.responses).toContainEqual({
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
    const resolve = reference.groups
      .find((group) => group.name === "Resolve")
      ?.operations.find((operation) => operation.method === "POST" && operation.path === "/api/v1/resolve");

    expect(resolve?.navTitle).toBe("Resolve link");
  });

  it("preserves every top-level composed response schema for response-object links", () => {
    const fixture = readFixture("public-openapi.json") as {
      paths: {
        "/api/v1/resolve": {
          post: { responses: { "200": { content: { "application/json": { schema: unknown } } } } };
        };
      };
    };
    fixture.paths["/api/v1/resolve"].post.responses["200"].content["application/json"].schema = {
      oneOf: [{ $ref: "#/components/schemas/ResolveSuccess" }, { $ref: "#/components/schemas/CcResolveSuccess" }],
    };

    const reference = buildApiReference(fixture);
    const resolveOperation = reference.groups
      .find((group) => group.name === "Resolve")
      ?.operations.find((operation) => operation.method === "POST" && operation.path === "/api/v1/resolve");
    const successResponse = resolveOperation?.responses.find((response) => response.status === "200");

    expect(successResponse).toMatchObject({
      status: "200",
      mediaTypes: [
        {
          mediaType: "application/json",
          schemaRefs: ["ResolveSuccess", "CcResolveSuccess"],
          schema: {
            oneOf: [{ $ref: "#/components/schemas/ResolveSuccess" }, { $ref: "#/components/schemas/CcResolveSuccess" }],
          },
        },
      ],
    });
  });

  it("exposes the renamed commercial share-page schemas as stable portal anchors", () => {
    const reference = buildApiReference(readFixture("public-openapi.json"));

    expect(reference.schemas.TrackSharePageResponse.anchor).toBe("schema-track-share-page-response");
    expect(reference.schemas.AlbumSharePageResponse.anchor).toBe("schema-album-share-page-response");
    expect(reference.schemas.ArtistSharePageResponse.anchor).toBe("schema-artist-share-page-response");
    expect(reference.schemas.SharePage.variants).toEqual(
      expect.arrayContaining([
        { name: "TrackSharePageResponse", anchor: "schema-track-share-page-response" },
        { name: "AlbumSharePageResponse", anchor: "schema-album-share-page-response" },
        { name: "ArtistSharePageResponse", anchor: "schema-artist-share-page-response" },
      ]),
    );
    expect(reference.schemas).not.toHaveProperty("CommercialTrackSharePageResponse");
    expect(reference.schemas).not.toHaveProperty("CommercialAlbumSharePageResponse");
    expect(reference.schemas).not.toHaveProperty("CommercialArtistSharePageResponse");
  });

  it("builds nested field documentation for response schemas", () => {
    const fixture = readFixture("public-openapi.json") as {
      components: { schemas: Record<string, unknown> };
      paths: {
        "/api/v1/resolve": {
          post: { responses: { "200": { content: { "application/json": { schema: unknown } } } } };
        };
      };
    };
    fixture.components.schemas.DocumentedChild = {
      type: "object",
      required: ["label"],
      properties: {
        label: { type: "string", description: "Human-readable child label." },
      },
    };
    fixture.components.schemas.DocumentedResponse = {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { $ref: "#/components/schemas/DocumentedChild", description: "Nested response payload." },
        cursor: { type: "string", nullable: true, description: "Optional cursor for a later page." },
      },
    };
    fixture.paths["/api/v1/resolve"].post.responses["200"].content["application/json"].schema = {
      $ref: "#/components/schemas/DocumentedResponse",
    };

    const reference = buildApiReference(fixture);

    expect(reference.schemas.DocumentedResponse).toMatchObject({
      fields: [
        {
          path: "payload",
          type: "DocumentedChild",
          required: true,
          description: "Nested response payload.",
          schemaRef: "DocumentedChild",
        },
        {
          path: "label",
          type: "string",
          required: true,
          description: "Human-readable child label.",
        },
        {
          path: "cursor",
          type: "string | null",
          required: false,
          description: "Optional cursor for a later page.",
        },
      ],
    });
  });

  it("orders top-level schema fields for reading while preserving source order inside each group", () => {
    const fixture = readFixture("public-openapi.json") as {
      components: { schemas: Record<string, unknown> };
    };
    fixture.components.schemas.OrderedFields = {
      type: "object",
      properties: {
        displayName: { type: "string" },
        ownerId: { type: "string" },
        type: { type: "string" },
        id: { type: "string" },
        artistId: { type: "string" },
        sourceType: { type: "string" },
        kind: { type: "string" },
        description: { type: "string" },
      },
    };

    const reference = buildApiReference(fixture);

    expect(reference.schemas.OrderedFields.fields.map((field) => field.path)).toEqual([
      "id",
      "ownerId",
      "artistId",
      "type",
      "sourceType",
      "kind",
      "displayName",
      "description",
    ]);
  });

  it("applies the same reading order to nested object fields", () => {
    const fixture = readFixture("public-openapi.json") as {
      components: { schemas: Record<string, unknown> };
    };
    fixture.components.schemas.NestedOrderedFields = {
      type: "object",
      properties: {
        payload: {
          type: "object",
          properties: {
            label: { type: "string" },
            ownerId: { type: "string" },
            kind: { type: "string" },
            id: { type: "string" },
            albumId: { type: "string" },
            mediaType: { type: "string" },
            note: { type: "string" },
          },
        },
      },
    };

    const reference = buildApiReference(fixture);

    expect(reference.schemas.NestedOrderedFields.fields.map(({ path, depth }) => ({ path, depth }))).toEqual([
      { path: "payload", depth: 0 },
      { path: "id", depth: 1 },
      { path: "ownerId", depth: 1 },
      { path: "albumId", depth: 1 },
      { path: "kind", depth: 1 },
      { path: "mediaType", depth: 1 },
      { path: "label", depth: 1 },
      { path: "note", depth: 1 },
    ]);
  });

  it("retains source order when a schema has no identity or discriminator fields", () => {
    const fixture = readFixture("public-openapi.json") as {
      components: { schemas: Record<string, unknown> };
    };
    fixture.components.schemas.SourceOrderedFields = {
      type: "object",
      properties: {
        zeta: { type: "string" },
        alpha: { type: "string" },
        note: { type: "string" },
      },
    };

    const reference = buildApiReference(fixture);

    expect(reference.schemas.SourceOrderedFields.fields.map((field) => field.path)).toEqual(["zeta", "alpha", "note"]);
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

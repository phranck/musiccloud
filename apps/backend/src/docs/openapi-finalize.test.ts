import { describe, expect, it } from "vitest";
import { finalizePublicOpenApiDocument } from "./openapi-finalize.js";

describe("finalizePublicOpenApiDocument", () => {
  it("prunes schemas not reachable from any path", () => {
    const doc = {
      paths: {
        "/a": {
          get: {
            responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Used" } } } } },
          },
        },
      },
      components: {
        schemas: {
          Used: { type: "object" },
          Orphan: { type: "object" },
        },
      },
    };

    const out = finalizePublicOpenApiDocument(doc);

    expect(Object.keys(out.components?.schemas ?? {})).toEqual(["Used"]);
  });

  it("keeps schemas reachable transitively through other schemas", () => {
    const doc = {
      paths: {
        "/a": {
          get: {
            responses: {
              200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Parent" } } } },
            },
          },
        },
      },
      components: {
        schemas: {
          Parent: { type: "object", properties: { child: { $ref: "#/components/schemas/Child" } } },
          Child: { type: "object", properties: { grand: { $ref: "#/components/schemas/Grand" } } },
          Grand: { type: "object" },
          Orphan: { type: "object" },
        },
      },
    };

    const out = finalizePublicOpenApiDocument(doc);

    expect(Object.keys(out.components?.schemas ?? {})).toEqual(["Child", "Grand", "Parent"]);
  });

  it("sorts tags, paths, and schemas alphabetically", () => {
    const doc = {
      tags: [{ name: "Zeta" }, { name: "Alpha" }, { name: "Mu" }],
      paths: {
        "/z": { get: { responses: {} } },
        "/a": { get: { responses: {} } },
        "/m": { get: { responses: {} } },
      },
      components: {
        schemas: { Zed: { type: "object" }, Abe: { type: "object" } },
      },
    };

    const out = finalizePublicOpenApiDocument(doc);

    expect((out.tags ?? []).map((t) => t.name)).toEqual(["Alpha", "Mu", "Zeta"]);
    expect(Object.keys(out.paths ?? {})).toEqual(["/a", "/m", "/z"]);
    // Both Zed and Abe are unreachable here, so pruning removes them; the point
    // of this case is order, asserted on a reachable set in the cases above.
    expect(Object.keys(out.components?.schemas ?? {})).toEqual([]);
  });

  it("does not mutate the input document", () => {
    const doc = {
      tags: [{ name: "B" }, { name: "A" }],
      paths: { "/b": {}, "/a": {} },
      components: { schemas: { Foo: {} } },
    };

    finalizePublicOpenApiDocument(doc);

    expect(doc.tags.map((t) => t.name)).toEqual(["B", "A"]);
    expect(Object.keys(doc.paths)).toEqual(["/b", "/a"]);
    expect(Object.keys(doc.components.schemas)).toEqual(["Foo"]);
  });

  it("tolerates a document without tags, paths, or components", () => {
    expect(finalizePublicOpenApiDocument({})).toEqual({
      tags: undefined,
      paths: {},
      components: { schemas: {} },
    });
  });
});

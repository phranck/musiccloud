import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { prepareGeneratorContract } from "./prepare-sdk-generator-contract.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  await readFile(path.join(scriptsRoot, "fixtures/sdk-generator-contract-defects.json"), "utf8"),
);

test("prepares Swift's supported nullable dialect without changing wire semantics", () => {
  const prepared = prepareGeneratorContract(fixture, "swift");

  assert.equal(prepared.openapi, "3.0.3");
  assert.deepEqual(prepared.components.schemas.NullableString, {
    type: "string",
    nullable: true,
  });
  assert.deepEqual(prepared.components.schemas.NullableReference, {
    allOf: [{ $ref: "#/components/schemas/NullableString" }],
    nullable: true,
  });
  assert.deepEqual(prepared.components.schemas.LegacyNullable, {
    type: "integer",
    nullable: true,
  });
});

test("expands required-only request variants for generators that scope oneOf branches independently", () => {
  const prepared = prepareGeneratorContract(fixture, "swift");
  const schema = prepared.paths["/resolve"].post.requestBody.content["application/json"].schema;

  assert.equal(schema.oneOf.length, 2);
  for (const variant of schema.oneOf) {
    assert.equal(variant.type, "object");
    assert.equal(variant.additionalProperties, false);
    assert.deepEqual(Object.keys(variant.properties), variant.required);
  }
  assert.equal(schema.properties, undefined);
});

test("flattens untagged request unions only for ogen while preserving both wire fields", () => {
  const prepared = prepareGeneratorContract(fixture, "go");
  const schema = prepared.paths["/resolve"].post.requestBody.content["application/json"].schema;

  assert.equal(schema.oneOf, undefined);
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ["query", "selectedCandidate"]);
});

test("flattens nested response unions only for ogen", () => {
  const go = prepareGeneratorContract(fixture, "go");
  const swift = prepareGeneratorContract(fixture, "swift");
  const goSchema = go.paths["/resolve"].post.responses["200"].content["application/json"].schema;
  const swiftSchema = swift.paths["/resolve"].post.responses["200"].content["application/json"].schema;

  assert.deepEqual(goSchema.oneOf, [
    { $ref: "#/components/schemas/FirstSuccess" },
    { $ref: "#/components/schemas/SecondSuccess" },
    { $ref: "#/components/schemas/DirectSuccess" },
  ]);
  assert.deepEqual(swiftSchema.oneOf, [
    { $ref: "#/components/schemas/NestedSuccess" },
    { $ref: "#/components/schemas/DirectSuccess" },
  ]);
});

test("applies ogen's case-insensitive canonical header spelling only to the Go view", () => {
  const go = prepareGeneratorContract(fixture, "go");
  const swift = prepareGeneratorContract(fixture, "swift");

  assert.equal(go.components.securitySchemes.ApiKeyAuth.name, "X-Api-Key");
  assert.equal(swift.components.securitySchemes.ApiKeyAuth.name, "X-API-Key");
});

test("marks ogen's unsupported plain-text response for raw decoding", () => {
  const go = prepareGeneratorContract(fixture, "go");
  const swift = prepareGeneratorContract(fixture, "swift");
  const goMedia = go.paths["/resolve"].post.responses["200"].content["text/plain"];
  const swiftMedia = swift.paths["/resolve"].post.responses["200"].content["text/plain"];

  assert.equal(goMedia["x-ogen-raw-response"], true);
  assert.equal(swiftMedia["x-ogen-raw-response"], undefined);
  assert.deepEqual(goMedia.schema, { type: "string", format: "uri" });
});

test("canonicalizes standard header spelling and is idempotent", () => {
  for (const adapter of ["swift", "go"]) {
    const once = prepareGeneratorContract(fixture, adapter);
    const twice = prepareGeneratorContract(once, adapter);

    assert.equal(once.paths["/binary/{id}"].get.parameters[0].name, "Range");
    assert.deepEqual(twice, once);
  }
});

test("hydrates required-only allOf overlays from their referenced component", () => {
  const swift = prepareGeneratorContract(fixture, "swift");
  const go = prepareGeneratorContract(fixture, "go");

  assert.deepEqual(swift.components.schemas.RequiredOverlay.allOf[1].properties, {
    value: { type: "string" },
  });
  assert.equal(go.components.schemas.RequiredOverlay.allOf[1].properties, undefined);
});

test("keeps Go on the canonical OpenAPI dialect and rejects unknown adapters", () => {
  const prepared = prepareGeneratorContract(fixture, "go");

  assert.equal(prepared.openapi, "3.1.0");
  assert.deepEqual(prepared.components.schemas.NullableString, fixture.components.schemas.NullableString);
  assert.throws(() => prepareGeneratorContract(fixture, "ruby"), /Unsupported SDK contract adapter: ruby/);
});

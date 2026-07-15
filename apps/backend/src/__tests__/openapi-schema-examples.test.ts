import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { createPublicErrorResponseSchema } from "../docs/public-response-schema.js";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

describe("public OpenAPI schema examples", () => {
  it("serializes every documented response example through its runtime schema", async () => {
    const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
    app.addSchema(createPublicErrorResponseSchema());
    for (const schema of OPENAPI_SCHEMAS) app.addSchema(schema);

    const examples = OPENAPI_SCHEMAS.filter(
      (schema): schema is (typeof OPENAPI_SCHEMAS)[number] & { example: unknown } => "example" in schema,
    );

    for (const [index, schema] of examples.entries()) {
      app.get(
        `/schema-example/${index}`,
        { schema: { response: { 200: { $ref: `${schema.$id}#` } } } },
        async () => schema.example,
      );
    }

    await app.ready();

    for (const [index, schema] of examples.entries()) {
      const response = await app.inject({ method: "GET", url: `/schema-example/${index}` });
      expect(response.statusCode, `${schema.$id}: ${response.body}`).toBe(200);
    }

    await app.close();
  });
});

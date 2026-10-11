import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  artistEntityIdSchema,
  jamendoFormatSchema,
  jamendoIdSchema,
  shareCodeSchema,
} from "./public-response-schema.js";

/**
 * Whether a value passes a parameter schema, judged by Fastify's own validator,
 * which is the one the routes run.
 *
 * @param schema - The parameter schema a builder produced.
 * @param value - The query value a request would carry.
 * @returns Whether the request is accepted.
 */
async function accepts(schema: object, value: string): Promise<boolean> {
  const app = Fastify();
  app.get(
    "/probe",
    { schema: { querystring: { type: "object", required: ["value"], properties: { value: schema } } } },
    async () => ({ ok: true }),
  );
  const response = await app.inject({ method: "GET", url: `/probe?value=${encodeURIComponent(value)}` });
  await app.close();
  return response.statusCode === 200;
}

describe("shareCodeSchema", () => {
  const schema = shareCodeSchema("Where the code comes from.");

  it("accepts every length ever issued, up to 64 characters", async () => {
    expect(await accepts(schema, "aBc123x")).toBe(true);
    expect(await accepts(schema, "a".repeat(64))).toBe(true);
    expect(await accepts(schema, "a".repeat(65))).toBe(false);
  });

  it("refuses characters outside the id alphabet and an empty code", async () => {
    expect(await accepts(schema, "share 1")).toBe(false);
    expect(await accepts(schema, "share%1")).toBe(false);
    expect(await accepts(schema, "")).toBe(false);
  });

  it("keeps the route's own description", () => {
    expect(schema.description).toBe("Where the code comes from.");
  });
});

describe("artistEntityIdSchema", () => {
  it("accepts a generated entity id and refuses one with a space", async () => {
    expect(await accepts(artistEntityIdSchema(), "V1StGXR8_Z5jdHi6B-myT")).toBe(true);
    expect(await accepts(artistEntityIdSchema(), "not a valid id")).toBe(false);
  });

  it("carries a description only when the route gives one", () => {
    expect(artistEntityIdSchema()).not.toHaveProperty("description");
    expect(artistEntityIdSchema("Public description.").description).toBe("Public description.");
  });
});

describe("jamendoIdSchema", () => {
  it("accepts a numeric id and refuses anything else", async () => {
    expect(await accepts(jamendoIdSchema(), "1886393")).toBe(true);
    expect(await accepts(jamendoIdSchema(), "18a")).toBe(false);
    expect(await accepts(jamendoIdSchema(), "")).toBe(false);
  });
});

describe("jamendoFormatSchema", () => {
  it("defaults to mp32 and refuses no format, because an unknown one falls back", async () => {
    const schema = jamendoFormatSchema();

    expect(schema.default).toBe("mp32");
    expect(schema).not.toHaveProperty("enum");
    expect(await accepts(schema, "wav")).toBe(true);
  });

  it("lists every format code in order and names the fallback", () => {
    expect(jamendoFormatSchema().description).toBe(
      "Jamendo delivery format: `mp31` (MP3 96 kbps), `mp32` (MP3 about 256 kbps), `ogg`, or `flac`. Invalid values also fall back to `mp32`.\n\n**Default**: `mp32`.",
    );
  });
});

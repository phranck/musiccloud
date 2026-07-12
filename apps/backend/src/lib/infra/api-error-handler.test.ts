import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createPublicErrorResponseSchema } from "../../docs/public-response-schema.js";
import { registerApiErrorHandling } from "./api-error-handler.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function testApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  registerApiErrorHandling(app);
  return app;
}

describe("registerApiErrorHandling", () => {
  it("maps a thrown PostgreSQL permission error to a safe response", async () => {
    const app = await testApp();
    app.get("/db", async () => {
      throw Object.assign(new Error("permission denied for table secrets"), { code: "42501" });
    });

    const response = await app.inject({ method: "GET", url: "/db" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: "MC-DB-0001",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "The database permissions are invalid for this operation. (MC-DB-0001)",
    });
    expect(response.body).not.toContain("secrets");
  });

  it("normalizes a route-authored legacy 404 response", async () => {
    const app = await testApp();
    app.get("/missing", async (_request, reply) =>
      reply.status(404).send({ error: "TRACK_NOT_FOUND", message: "No share exists." }),
    );

    const response = await app.inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "MC-RES-0001",
      errorId: expect.any(String),
      message: "No share exists. (MC-RES-0001)",
    });
  });

  it("normalizes a plain-text error response instead of letting it bypass the contract", async () => {
    const app = await testApp();
    app.get("/plain", async (_request, reply) => reply.status(400).type("text/plain").send("Bad input"));

    const response = await app.inject({ method: "GET", url: "/plain" });

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toMatchObject({
      error: "MC-REQ-0001",
      errorId: expect.any(String),
      message: "Bad input (MC-REQ-0001)",
    });
  });

  it("does not modify successful payloads", async () => {
    const app = await testApp();
    app.get("/ok", async () => ({ status: "ok" }));

    const response = await app.inject({ method: "GET", url: "/ok" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("backend registration", () => {
  it("registers global normalization before routes and requires the full error schema", async () => {
    const server = await readFile(resolve(process.cwd(), "src/server.ts"), "utf8");

    expect(server).toContain("registerApiErrorHandling(app)");
    expect(server.indexOf("registerApiErrorHandling(app)")).toBeLessThan(
      server.indexOf("await app.register(authRoutes)"),
    );
    expect(server).toContain("app.addSchema(createPublicErrorResponseSchema())");
    expect(createPublicErrorResponseSchema().required).toEqual(["error", "message", "errorId"]);
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

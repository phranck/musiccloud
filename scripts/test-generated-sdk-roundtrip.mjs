#!/usr/bin/env node

import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const generatedSdkDir = path.resolve(process.argv[2] ?? ".tmp/sdk/generated/typescript");
const require = createRequire(import.meta.url);
const {
  Configuration,
  MusiccloudApiError,
  MusiccloudProtocolError,
  MusiccloudTransportError,
  ResolveApi,
} = require(path.join(generatedSdkDir, "dist/index.js"));

const responses = {
  "rate-limit": {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": "42",
      "x-ratelimit-limit": "10",
      authorization: "Bearer fixture-secret",
    },
    body: JSON.stringify({
      error: "MC-API-0003",
      message: "Too many requests. (MC-API-0003)",
      errorId: "10000000-0000-4000-8000-000000000101",
      context: { retryAfterSeconds: 42, apiKey: "fixture-secret" },
    }),
  },
  "future-code": {
    status: 503,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      error: "MC-API-3999",
      message: "A future upstream failure occurred. (MC-API-3999)",
      errorId: "10000000-0000-4000-8000-000000000102",
      context: { provider: "future-service" },
    }),
  },
  malformed: {
    status: 502,
    headers: { "content-type": "application/json" },
    body: '{"Authorization":"Bearer fixture-secret"',
  },
};

const serializedRequests = new Map();
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const fixtureName = request.headers["x-fixture-case"];
    const fixture = typeof fixtureName === "string" ? responses[fixtureName] : undefined;
    if (fixture === undefined) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("unknown fixture");
      return;
    }
    serializedRequests.set(fixtureName, Buffer.concat(chunks).toString("utf8"));
    response.writeHead(fixture.status, fixture.headers);
    response.end(fixture.body);
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
assert.ok(address && typeof address === "object");
const basePath = `http://127.0.0.1:${address.port}`;

async function callFixture(fixtureName) {
  const api = new ResolveApi(
    new Configuration({
      basePath,
      headers: { "x-fixture-case": fixtureName },
    }),
  );
  let captured;
  try {
    await api.apiV1ResolvePost({
      apiV1ResolvePostRequest: { query: `fixture-${fixtureName}` },
    });
  } catch (error) {
    captured = error;
  }
  assert.ok(captured, `${fixtureName} should fail`);
  assert.deepEqual(JSON.parse(serializedRequests.get(fixtureName)), {
    query: `fixture-${fixtureName}`,
  });
  return captured;
}

try {
  const rateLimit = await callFixture("rate-limit");
  assert.ok(rateLimit instanceof MusiccloudApiError);
  assert.equal(rateLimit.code, "MC-API-0003");
  assert.equal(rateLimit.status, 429);
  assert.equal(rateLimit.errorId, "10000000-0000-4000-8000-000000000101");
  assert.equal(rateLimit.retryAfterSeconds, 42);
  assert.equal(rateLimit.retryHeaders["x-ratelimit-limit"], "10");
  assert.equal(rateLimit.context?.apiKey, undefined);
  assert.doesNotMatch(rateLimit.toString(), /fixture-secret|authorization/i);

  const future = await callFixture("future-code");
  assert.ok(future instanceof MusiccloudApiError);
  assert.equal(future.code, "MC-API-3999");
  assert.equal(future.context?.provider, "future-service");

  const malformed = await callFixture("malformed");
  assert.ok(malformed instanceof MusiccloudProtocolError);
  assert.equal(malformed.reason, "invalid-json");
  assert.equal("code" in malformed, false);
  assert.doesNotMatch(malformed.toString(), /fixture-secret|authorization/i);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const unavailableApi = new ResolveApi(new Configuration({ basePath }));
let transport;
try {
  await unavailableApi.apiV1ResolvePost({
    apiV1ResolvePostRequest: { query: "fixture-transport" },
  });
} catch (error) {
  transport = error;
}
assert.ok(transport instanceof MusiccloudTransportError);
assert.equal(transport.kind, "network");

console.log("Generated TypeScript SDK HTTP roundtrip passed.");

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { Agent, fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestThroughDispatcher, undiciTransport } from "./fetch.js";

/**
 * A compressed answer must arrive decoded on every supported Node version.
 * On Node 26 the built-in fetch combined with the npm undici dispatcher
 * returned the gzip bytes raw, so every JSON answer failed to parse.
 */
describe("requestThroughDispatcher decoding", () => {
  let server: Server;
  let origin: string;
  const dispatcher = new Agent();

  beforeAll(async () => {
    // The test setup routes the transport to a mock; this test needs the real one.
    undiciTransport.fetch = undiciFetch;
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      response.end(gzipSync(JSON.stringify({ ok: true })));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await dispatcher.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("decodes a gzip body", async () => {
    const response = await requestThroughDispatcher(new URL(`${origin}/data`), {}, dispatcher);
    expect(await response.json()).toEqual({ ok: true });
  });
});

/**
 * Unit tests for the two Creem product operations the SDK does not cover.
 *
 * `fetch` is stubbed, so these assert the shape of the request that carries our
 * API key: which host it goes to, which header holds the key, and that a
 * redirect is never followed. They also assert that a refusal from Creem comes
 * back as a `CreemProductError` with the code the route answers with, rather
 * than as an unclassified throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/creem-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/creem-config.js")>()),
  getCreemConfig: vi.fn(() => ({ apiKeys: { test: "creem_test_secret" }, webhookSecret: undefined })),
  requireCreemApiKey: vi.fn(() => "creem_test_secret"),
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { deviation: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { log } from "../lib/infra/logger.js";
import { archiveCreemProduct, CreemProductError, updateCreemProductPrice } from "./creem-products.js";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Builds a `Response`-shaped stub, because only four of its members are read. */
function response(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

describe("updateCreemProductPrice", () => {
  it("patches the product on the sandbox host with the key in x-api-key", async () => {
    fetchMock.mockResolvedValue(
      response(200, JSON.stringify({ id: "prod_1", price: 1490, currency: "EUR", status: "active" })),
    );

    const product = await updateCreemProductPrice("test", "prod_1", 1490);

    expect(product.price).toBe(1490);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://test-api.creem.io/v1/products/prod_1");
    expect(init.method).toBe("PATCH");
    expect(init.headers["x-api-key"]).toBe("creem_test_secret");
    expect(JSON.parse(init.body as string)).toEqual({ price: 1490 });
  });

  it("never follows a redirect, because the key travels on the request", async () => {
    fetchMock.mockResolvedValue(
      response(200, JSON.stringify({ id: "p", price: 1, currency: "EUR", status: "active" })),
    );

    await updateCreemProductPrice("test", "prod_1", 1490);

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).redirect).toBe("manual");
  });

  it("reports a refusal as MC-BILL-0002 and logs it as a deviation", async () => {
    fetchMock.mockResolvedValue(response(422, '{"error":"price too low"}'));

    await expect(updateCreemProductPrice("test", "prod_1", 1)).rejects.toBeInstanceOf(CreemProductError);
    await expect(updateCreemProductPrice("test", "prod_1", 1)).rejects.toMatchObject({ code: "MC-BILL-0002" });
    expect(vi.mocked(log.deviation).mock.calls[0]?.[0]?.errorCode).toBe("MC-BILL-0002");
  });

  it("keeps the API key out of what it throws and logs", async () => {
    fetchMock.mockResolvedValue(response(500, "upstream exploded"));

    const error = await updateCreemProductPrice("test", "prod_1", 1490).catch((thrown: Error) => thrown);

    expect(JSON.stringify(error)).not.toContain("creem_test_secret");
    expect(JSON.stringify(vi.mocked(log.deviation).mock.calls)).not.toContain("creem_test_secret");
  });
});

describe("archiveCreemProduct", () => {
  it("sends a DELETE with no body and accepts an empty response", async () => {
    fetchMock.mockResolvedValue(response(204, ""));

    await expect(archiveCreemProduct("test", "prod_1")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-api.creem.io/v1/products/prod_1");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("reports a refusal as MC-BILL-0003, which is what keeps the mapping row", async () => {
    fetchMock.mockResolvedValue(response(409, '{"error":"cannot archive"}'));

    await expect(archiveCreemProduct("test", "prod_1")).rejects.toMatchObject({ code: "MC-BILL-0003" });
  });
});

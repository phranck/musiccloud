/**
 * @file Tests for fetching a resource from a site musiccloud does not control.
 *
 * Ported from lmaa.space `apps/backend/src/__tests__/og.test.ts`. Adapted: the
 * requests run through the real `fetchWithTimeout`, whose hops `vitest.setup.ts`
 * routes to the global `fetch` stubbed here and whose DNS answers it fixes, so
 * the guard that refuses private targets is the production one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubNetwork } from "./__tests__/network-stub.js";
import { fetchExternalResource } from "./external-resource.js";
import { log } from "./infra/logger.js";

/** The timeout the tests pass where a caller of `fetchExternalResource` would pass its own. */
const TEST_TIMEOUT_MS = 5000;

describe("fetchExternalResource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the final URL for a direct external response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternalResource(
      "https://example.com",
      { headers: { Accept: "text/html" } },
      TEST_TIMEOUT_MS,
    );

    expect(result?.finalUrl).toBe("https://example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com", expect.objectContaining({ redirect: "manual" }));
  });

  it("turns an asynchronous network rejection into no result", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(
      fetchExternalResource("https://example.com/image.png", { headers: { Accept: "image/*" } }, TEST_TIMEOUT_MS),
    ).resolves.toBeNull();
  });

  it("follows redirects to another external URL", async () => {
    const fetchMock = stubNetwork((url) =>
      url === "https://example.com/start"
        ? new Response(null, { status: 302, headers: { location: "https://cdn.example.com/image.png" } })
        : new Response("img", { status: 200, headers: { "content-type": "image/png" } }),
    );

    const result = await fetchExternalResource(
      "https://example.com/start",
      { headers: { Accept: "image/*" } },
      TEST_TIMEOUT_MS,
    );

    expect(result?.finalUrl).toBe("https://cdn.example.com/image.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    "http://127.0.0.1/internal",
    // `vitest.setup.ts` resolves this name to the loopback address.
    "http://localhost/internal",
  ])("blocks a redirect to the private target %s", async (location) => {
    const deviation = vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternalResource(
      "https://example.com/start",
      { headers: { Accept: "text/html" } },
      TEST_TIMEOUT_MS,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ component: "PreviewImage", host: "example.com" }),
      expect.objectContaining({ message: "Blocked non-public outbound target" }),
    );
  });

  it("never requests a private target it was handed directly", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalResource("http://10.0.0.1/", {}, TEST_TIMEOUT_MS)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

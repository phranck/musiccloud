import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UMAMI_ORIGIN } from "../security-headers.js";
import { proxyUmamiEvent, proxyUmamiScript } from "../umami-proxy.js";
import { REPOSITORY_ROOT, shippedSourceFiles } from "./repository-sources.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs `fetch` with one answer and returns the stub, so a test can read what was sent. */
function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The headers of the request the proxy sent to Umami. */
function sentHeaders(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
  return (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
}

describe("proxyUmamiEvent", () => {
  it("names the first hop of X-Forwarded-For as the visitor in both vendor headers", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }));
    const request = new Request("https://musiccloud.io/api/mc/api/send", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      body: "{}",
    });

    await proxyUmamiEvent(request, "10.0.0.9");

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${UMAMI_ORIGIN}/api/send`);
    expect(sentHeaders(fetchMock)).toMatchObject({
      "True-Client-IP": "203.0.113.7",
      "CF-Connecting-IP": "203.0.113.7",
      "X-Forwarded-For": "203.0.113.7, 10.0.0.1",
    });
  });

  it("falls back to the connection's address when no X-Forwarded-For arrived", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }));
    const request = new Request("https://musiccloud.io/api/mc/api/send", { method: "POST", body: "{}" });

    await proxyUmamiEvent(request, "198.51.100.4");

    expect(sentHeaders(fetchMock)).toMatchObject({
      "True-Client-IP": "198.51.100.4",
      "CF-Connecting-IP": "198.51.100.4",
    });
  });

  it("answers an empty 204 when Umami cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const request = new Request("https://musiccloud.io/api/mc/api/send", { method: "POST", body: "{}" });

    expect((await proxyUmamiEvent(request, undefined)).status).toBe(204);
  });
});

describe("proxyUmamiScript", () => {
  it("serves the script with a day of caching, and nothing when Umami fails", async () => {
    stubFetch(new Response("console.log('umami')", { status: 200 }));
    const served = await proxyUmamiScript();
    expect(served.headers.get("Content-Type")).toBe("application/javascript");
    expect(await served.text()).toBe("console.log('umami')");

    stubFetch(new Response("", { status: 502 }));
    expect((await proxyUmamiScript()).status).toBe(204);
  });
});

describe("the Umami host", () => {
  it("is written in security-headers.ts only, so the proxy and the policy read one value", () => {
    const sources = shippedSourceFiles().filter((path) =>
      readFileSync(join(REPOSITORY_ROOT, path), "utf8").includes(new URL(UMAMI_ORIGIN).host),
    );

    expect(sources).toEqual(["packages/shared/src/security-headers.ts"]);
  });
});

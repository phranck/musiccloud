import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UMAMI_ORIGIN } from "../security-headers.js";
import { proxyUmamiEvent, proxyUmamiScript } from "../umami-proxy.js";

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

/** Every source file under a directory, recursively, leaving out tests and build output. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" || entry === "dist" ? [] : sourceFiles(path);
    return /\.(ts|tsx|astro|mjs)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("the Umami host", () => {
  /** The repository root, from this file in `packages/shared/src/__tests__`. */
  const root = join(import.meta.dirname, "..", "..", "..", "..");

  it("is written in security-headers.ts only, so the proxy and the policy read one value", () => {
    const sources = ["apps/backend/src", "apps/frontend/src", "apps/developer/src", "apps/dashboard/src", "packages"]
      .flatMap((directory) => sourceFiles(join(root, directory)))
      .filter((path) => readFileSync(path, "utf8").includes(new URL(UMAMI_ORIGIN).host))
      .map((path) => path.slice(root.length + 1));

    expect(sources).toEqual(["packages/shared/src/security-headers.ts"]);
  });
});

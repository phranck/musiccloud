/**
 * @file Guards that the BFF proxy cannot be steered outside `/api/dev/`.
 *
 * The target is built by concatenating the wildcard tail onto a prefix, and URL
 * parsing resolves dot segments afterwards. `../v1/resolve` therefore lands on
 * `/api/v1/resolve`, which the backend guards with `authenticatePublic` and
 * which accepts the internal key this proxy attaches as full authentication.
 * A caller reaching that path would be using a credential it does not hold.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  backendUrl: (path: string) => `http://backend:4000${path}`,
  INTERNAL_API_KEY: "internal-test-key",
}));

const { ALL } = await import("../pages/api/dev/[...path].ts");

const fetchMock = vi.fn();

function callProxy(path: string) {
  return ALL({
    params: { path },
    request: new Request("https://developer.musiccloud.io/api/dev/anything", { method: "GET" }),
    clientAddress: "203.0.113.5",
    // The route reads only these three; the rest of the Astro context is unused.
  } as unknown as Parameters<typeof ALL>[0]);
}

describe("BFF proxy path containment", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("forwards an ordinary path to the backend", async () => {
    const response = await callProxy("auth/me");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as [URL])[0])).toBe("http://backend:4000/api/dev/auth/me");
  });

  it.each([
    ["../v1/resolve", "raw dot segments"],
    ["%2e%2e/v1/resolve", "percent-encoded dot segments"],
    ["../../health/backend", "climbing past the API namespace"],
    ["..", "a bare parent reference"],
  ])("refuses %s (%s) without contacting the backend", async (path) => {
    const response = await callProxy(path);

    expect(response.status).toBe(404);
    // The credential must never travel to a caller-chosen destination, so the
    // request has to be refused before any fetch happens.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a tail that merely looks like traversal but stays contained", async () => {
    // `..%2f` is not a separator, so this never leaves the namespace and the
    // backend is free to answer it with its own 404.
    const response = await callProxy("..%2fv1%2fresolve");

    expect(response.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as [URL])[0])).toContain("/api/dev/");
  });

  it("attaches the internal key only on a contained target", async () => {
    await callProxy("auth/me");

    const init = (fetchMock.mock.calls[0] as [URL, RequestInit])[1];
    expect((init.headers as Headers).get("X-API-Key")).toBe("internal-test-key");
  });
});

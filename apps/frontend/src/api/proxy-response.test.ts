import { describe, expect, it, vi } from "vitest";

import { apiErrorResponse, badRequestResponse, createResolveRoute, relayHeaders } from "./proxy-response";

/** The visitor address every resolve request in these tests comes from. */
const VISITOR_ADDRESS = "203.0.113.10";

/** The origin every resolve request in these tests names. */
const VISITOR_ORIGIN = "https://musiccloud.test";

/**
 * Calls a resolve handler the way Astro does for a `POST` with a JSON body.
 *
 * @param route - The handler under test.
 * @param body - The JSON body the visitor sends.
 * @returns The handler's answer.
 */
async function postResolve(route: ReturnType<typeof createResolveRoute>, body: unknown): Promise<Response> {
  return route({
    request: new Request(`${VISITOR_ORIGIN}/api/resolve`, {
      method: "POST",
      headers: { Origin: VISITOR_ORIGIN },
      body: JSON.stringify(body),
    }),
    clientAddress: VISITOR_ADDRESS,
  } as Parameters<typeof route>[0]) as Promise<Response>;
}

describe("relayHeaders", () => {
  it("passes on only the named headers the backend sent, over the base", () => {
    const upstream = new Response(null, {
      headers: { "Content-Type": "image/png", "Set-Cookie": "session=1", "Retry-After": "30" },
    });

    const headers = relayHeaders(upstream, ["content-type", "Cache-Control"], {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
    });

    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("Set-Cookie")).toBeNull();
    expect(headers.get("Retry-After")).toBeNull();
  });

  it("leaves a header the backend did not send absent when no base names it", () => {
    const headers = relayHeaders(new Response(null), ["Cache-Control"]);

    expect(headers.get("Cache-Control")).toBeNull();
  });
});

describe("apiErrorResponse", () => {
  it("answers in the error envelope with the status, the code and the extra headers", async () => {
    const response = apiErrorResponse(413, "MC-REQ-0001", { "Cache-Control": "no-store" });

    expect(response.status).toBe(413);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });
});

describe("badRequestResponse", () => {
  it("refuses with 400 and MC-REQ-0001, a fresh error ID each time", async () => {
    const first = await badRequestResponse().json();
    const second = await badRequestResponse().json();

    expect(first).toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
    expect(second.errorId).not.toBe(first.errorId);
  });

  it("keeps JSON as the type when the extra headers name another", () => {
    const response = badRequestResponse({ "Content-Type": "application/json", "Cache-Control": "no-store" });

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("createResolveRoute", () => {
  it("forwards the body, the visitor address and the origin to the backend call", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("{}"));
    const route = createResolveRoute(resolve);

    await postResolve(route, { query: "hello" });

    expect(resolve).toHaveBeenCalledWith({ query: "hello" }, VISITOR_ADDRESS, VISITOR_ORIGIN);
  });

  it("streams the backend's status and body back as JSON with its Retry-After", async () => {
    const backendBody = JSON.stringify({ retry: true });
    const resolve = vi.fn().mockResolvedValue(
      new Response(backendBody, {
        status: 429,
        headers: { "Content-Type": "text/plain", "Retry-After": "12", "Set-Cookie": "session=1" },
      }),
    );

    const response = await postResolve(createResolveRoute(resolve), { selectedCandidate: "jamendo:1" });

    expect(response.status).toBe(429);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expect(response.text()).resolves.toBe(backendBody);
  });

  it("sends no Retry-After when the backend sent none", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await postResolve(createResolveRoute(resolve), { query: "hello" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Retry-After")).toBeNull();
  });
});

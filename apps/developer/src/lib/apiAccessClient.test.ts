/**
 * @file Transport tests for the API-access client.
 *
 * The one thing that is easy to get wrong here is the content type. Fastify
 * refuses a request that announces JSON and then sends nothing, and three of
 * these routes carry their subject in the path and have no body at all, so a
 * blanket header made key creation, rotation and revocation fail with a `400`
 * before they reached their handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClientToken, listDeveloperProjects, revokeClientToken, updateDeveloperProject } from "./apiAccessClient";

function stubFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The request init of the last call, which is what these tests are about. */
function lastInit(fetchMock: ReturnType<typeof stubFetch>): RequestInit {
  return (fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1];
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("the API-access transport", () => {
  it("announces JSON only when it is actually sending some", async () => {
    const fetchMock = stubFetch();

    await updateDeveloperProject("project-1", { displayName: "Renamed" });

    expect(lastInit(fetchMock).headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends no content type on a request that has no body", async () => {
    const fetchMock = stubFetch(201, { token: {} });

    await createClientToken("client-1");

    // A body-less POST that claims to carry JSON is refused by Fastify with
    // FST_ERR_CTP_EMPTY_JSON_BODY, which arrives as a bare MC-REQ-0001.
    expect(lastInit(fetchMock).headers).toEqual({});
    expect(lastInit(fetchMock).body).toBeUndefined();
  });

  it("does the same for the other two token routes", async () => {
    const fetchMock = stubFetch(200, { token: {} });

    await revokeClientToken("token-1");

    expect(lastInit(fetchMock).headers).toEqual({});
  });

  it("still sends the session cookie on every request", async () => {
    const fetchMock = stubFetch(200, { projects: [] });

    await listDeveloperProjects();

    expect(lastInit(fetchMock).credentials).toBe("same-origin");
  });
});

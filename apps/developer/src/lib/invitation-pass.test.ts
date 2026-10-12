import { INVITATION_PASS_COOKIE_NAME } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  backendUrl: (path: string) => `http://backend:4000${path}`,
  internalHeaders: (_clientIp?: string, extra?: Record<string, string>) => ({ "X-API-Key": "test-key", ...extra }),
}));

import { readInvitationPass } from "./invitation-pass";

/** A request context carrying the given pass cookie, or none. */
function contextWith(pass?: string) {
  return {
    cookies: { get: (name: string) => (name === INVITATION_PASS_COOKIE_NAME && pass ? { value: pass } : undefined) },
    clientAddress: "203.0.113.7",
  } as never;
}

describe("readInvitationPass", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks nothing for a request without the cookie", async () => {
    await expect(readInvitationPass(contextWith())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the pass and answers with the invited address", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ valid: true, email: "new@example.com" })));

    await expect(readInvitationPass(contextWith("pass-token"))).resolves.toEqual({ email: "new@example.com" });
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers.cookie).toBe(`${INVITATION_PASS_COOKIE_NAME}=pass-token`);
  });

  it("counts a spent pass, an error and an unreachable backend as no pass", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ valid: false, email: null })));
    await expect(readInvitationPass(contextWith("pass-token"))).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(readInvitationPass(contextWith("pass-token"))).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(readInvitationPass(contextWith("pass-token"))).resolves.toBeNull();

    // A spent pass is an answer, not a failure, so only the other two are logged.
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });
});

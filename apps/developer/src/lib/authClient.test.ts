import { afterEach, describe, expect, it, vi } from "vitest";
import { postAuth } from "./authClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postAuth", () => {
  it("keeps the code, the message and the error ID of a refused request", async () => {
    const refusal = {
      error: "MC-AUTH-0001",
      message: "You need to sign in before performing this action. (MC-AUTH-0001)",
      errorId: "err-login",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(refusal), { status: 401 })),
    );

    await expect(postAuth("/api/dev/auth/login", {})).resolves.toEqual({
      ok: false,
      status: 401,
      code: refusal.error,
      message: refusal.message,
      errorId: refusal.errorId,
    });
  });

  it("leaves every field unset for a body that is not an error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    await expect(postAuth("/api/dev/auth/login", {})).resolves.toEqual({ ok: false, status: 502 });
  });
});

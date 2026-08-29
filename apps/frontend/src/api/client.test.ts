import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("BACKEND_URL", "https://backend.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchShareData", () => {
  it("preserves backend status, code, safe message, and incident id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "MC-DB-0001",
            errorId: "d4885fe8-1e28-4479-a31e-4e9274e17c6d",
            message: "The database permissions are invalid for this operation. (MC-DB-0001)",
          }),
          { headers: { "Content-Type": "application/json" }, status: 500 },
        ),
      ),
    );
    const { fetchShareData } = await import("./client");

    await expect(fetchShareData("abc")).resolves.toEqual({
      error: {
        error: "MC-DB-0001",
        errorId: "d4885fe8-1e28-4479-a31e-4e9274e17c6d",
        message: "The database permissions are invalid for this operation. (MC-DB-0001)",
      },
      kind: "error",
      statusCode: 500,
    });
  });

  it("keeps an explicit backend 404 distinguishable from failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "MC-RES-0003",
            errorId: "c90e71bc-d568-453f-b2dc-8cdbf72d6829",
            message: "The requested resource was not found. (MC-RES-0003)",
          }),
          { headers: { "Content-Type": "application/json" }, status: 404 },
        ),
      ),
    );
    const { fetchShareData } = await import("./client");

    await expect(fetchShareData("missing")).resolves.toMatchObject({ kind: "not-found", statusCode: 404 });
  });

  it("returns a reportable frontend incident when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchShareData } = await import("./client");

    const result = await fetchShareData("abc");
    expect(result).toMatchObject({
      error: { error: "MC-SYS-0002", errorId: expect.any(String) },
      kind: "error",
      statusCode: 503,
    });
  });
});

describe("fetchPublicContentPage", () => {
  it("does not collapse a backend content failure into not-found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "MC-DB-0003",
            errorId: "5049cd40-e959-4e07-978d-bde2c47a3f67",
            message: "The database is temporarily unavailable. (MC-DB-0003)",
          }),
          { headers: { "Content-Type": "application/json" }, status: 503 },
        ),
      ),
    );
    const { fetchPublicContentPage } = await import("./client");

    await expect(fetchPublicContentPage("about")).resolves.toMatchObject({
      error: { error: "MC-DB-0003", errorId: "5049cd40-e959-4e07-978d-bde2c47a3f67" },
      kind: "error",
      statusCode: 503,
    });
  });

  it("requests editorial content without a locale parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: "about" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchPublicContentPage } = await import("./client");

    await fetchPublicContentPage("about");

    expect(fetchMock).toHaveBeenCalledWith("https://backend.test/api/v1/content/about", expect.any(Object));
  });
});

describe("fetchNavigation", () => {
  it("requests editorial navigation without a locale parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchNavigation } = await import("./client");

    await fetchNavigation("header");

    expect(fetchMock).toHaveBeenCalledWith("https://backend.test/api/v1/nav/header", expect.any(Object));
  });
});

describe("transport failures", () => {
  /**
   * Node rejects a failed fetch with `TypeError: fetch failed` and puts the
   * system error one level down in `cause`, which is where the reason has to be
   * read from.
   */
  function transportError(code: string): Error {
    const error = new TypeError("fetch failed");
    (error as { cause?: unknown }).cause = Object.assign(new Error(code), { code });
    return error;
  }

  it("names a recognised cause in the message shown to the visitor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError("ECONNREFUSED")));
    vi.stubGlobal("console", { ...console, error: vi.fn() });
    const { fetchShareData } = await import("./client");

    const result = await fetchShareData("abc");

    if (result.kind === "success") throw new Error("expected a transport failure");
    expect(result.error.message).toBe(
      "The backend could not be reached. The service refused the connection. (MC-SYS-0002)",
    );
  });

  it("says nothing beyond the generic message for an unrecognised cause", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError("ESOMETHINGNEW")));
    vi.stubGlobal("console", { ...console, error: vi.fn() });
    const { fetchShareData } = await import("./client");

    const result = await fetchShareData("abc");

    if (result.kind === "success") throw new Error("expected a transport failure");
    expect(result.error.message).toBe("The backend could not be reached. (MC-SYS-0002)");
  });

  /**
   * The id on the visitor's screen is only worth quoting if it also exists in a
   * log line, together with the cause that never reaches them.
   */
  it("logs the incident id together with the cause", async () => {
    const errorLog = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError("ENOTFOUND")));
    vi.stubGlobal("console", { ...console, error: errorLog });
    const { fetchShareData } = await import("./client");

    const result = await fetchShareData("abc");

    if (result.kind === "success") throw new Error("expected a transport failure");
    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(errorLog.mock.calls[0]?.[0]));
    expect(logged.errorId).toBe(result.error.errorId);
    expect(logged.cause).toBe("ENOTFOUND");
    expect(logged.errorCode).toBe("MC-SYS-0002");
  });
});

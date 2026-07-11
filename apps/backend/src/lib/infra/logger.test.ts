import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("structured production logger", () => {
  it("emits a searchable deviation record without credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { log } = await import("./logger.js");

    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-DB-0004",
        operation: "vinyl_layout_refresh",
        outcome: "cached_fallback",
      },
      new Error("postgres://db:secret@host/db password=hunter2"),
    );

    expect(warn).toHaveBeenCalledOnce();
    const record = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({
      component: "VinylLayout",
      errorCode: "MC-DB-0004",
      level: "warn",
      operation: "vinyl_layout_refresh",
      outcome: "cached_fallback",
    });
    expect(record).toHaveProperty("timestamp");
    expect(JSON.stringify(record)).not.toContain("secret");
    expect(JSON.stringify(record)).not.toContain("hunter2");
  });

  it("normalizes legacy production errors into one JSON record", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { log } = await import("./logger.js");

    log.error("Resolver", "Cache read failed", new Error("connection refused"));

    const record = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({ component: "Resolver", level: "error" });
    expect(record.message).toContain("Cache read failed");
    expect(record.message).toContain("connection refused");
    expect(record).not.toHaveProperty("stack");
  });

  it("promotes legacy debug failure messages to structured production deviations", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { log } = await import("./logger.js");

    log.debug("Resolver", "Preview persist failed", new Error("connection refused"));

    const record = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({
      component: "Resolver",
      errorCode: "MC-SYS-0001",
      level: "warn",
      operation: "legacy_debug_deviation",
      outcome: "fallback_or_omission",
    });
    expect(record.message).toContain("Preview persist failed");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const closeRepository = vi.hoisted(() => vi.fn(async () => {}));
const poolEnd = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [] })), end: poolEnd })),
}));

vi.mock("../db/index.js", () => ({
  closeRepository,
  getCcRepository: vi.fn(async () => ({})),
}));

describe("backfill-cc-cache", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("closes the repository connection once the run is over, so the process can exit", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://backfill-test@localhost:5433/none");
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("./backfill-cc-cache.js");

    await vi.waitFor(() => expect(closeRepository).toHaveBeenCalledTimes(1));
    expect(poolEnd).toHaveBeenCalledTimes(1);
  });
});

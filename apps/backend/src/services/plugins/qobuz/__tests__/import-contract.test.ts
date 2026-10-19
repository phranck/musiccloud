import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/infra/fetch", () => ({ fetchWithTimeout: fetchMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  fetchMock.mockReset();
});

describe("Qobuz: module import", () => {
  it("does not log into an account merely because credentials are configured", async () => {
    vi.resetModules();
    vi.stubEnv("QOBUZ_EMAIL", "audit@example.invalid");
    vi.stubEnv("QOBUZ_PASSWORD", "test-only-password");
    fetchMock.mockImplementation(async () => Response.json({ user_auth_token: "test-only-token" }));
    await import("../adapter");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

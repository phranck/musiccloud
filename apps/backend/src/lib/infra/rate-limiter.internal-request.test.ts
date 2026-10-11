import type { FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real comparison by default, so a test can still swap in an answer and
// prove the function asks `secretsMatch` rather than comparing on its own.
vi.mock("./secret-compare.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./secret-compare.js")>();
  return { secretsMatch: vi.fn(actual.secretsMatch) };
});

const { secretsMatch } = await import("./secret-compare.js");
const { isInternalRequest } = await import("./rate-limiter.js");

/** A request carrying only the header `isInternalRequest` reads. */
function requestWithKey(key: string | string[] | undefined): FastifyRequest {
  return { headers: key === undefined ? {} : { "x-api-key": key } } as unknown as FastifyRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isInternalRequest", () => {
  it("decides through the constant-time comparison", () => {
    vi.stubEnv("INTERNAL_API_KEY", "the-internal-key");
    vi.mocked(secretsMatch).mockReturnValueOnce(true);

    expect(isInternalRequest(requestWithKey("a-different-key"))).toBe(true);
    expect(secretsMatch).toHaveBeenCalledWith("a-different-key", "the-internal-key");
  });

  it("accepts the configured key and refuses any other", () => {
    vi.stubEnv("INTERNAL_API_KEY", "the-internal-key");

    expect(isInternalRequest(requestWithKey("the-internal-key"))).toBe(true);
    expect(isInternalRequest(requestWithKey("the-internal-kez"))).toBe(false);
  });

  it("refuses every request while the key is unset", () => {
    vi.stubEnv("INTERNAL_API_KEY", "");

    expect(isInternalRequest(requestWithKey(""))).toBe(false);
    expect(isInternalRequest(requestWithKey(undefined))).toBe(false);
  });

  it("refuses a repeated header", () => {
    vi.stubEnv("INTERNAL_API_KEY", "the-internal-key");

    expect(isInternalRequest(requestWithKey(["the-internal-key", "the-internal-key"]))).toBe(false);
  });
});

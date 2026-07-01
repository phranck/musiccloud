import { describe, expect, it } from "vitest";
import { formatApiTokenForDisplay, generateApiToken, hashApiToken } from "./api-access-token.js";

describe("generateApiToken", () => {
  it("produces a token in the mc_live_<prefix>_<secret> shape", () => {
    const { raw, prefix } = generateApiToken();
    expect(raw.startsWith("mc_live_")).toBe(true);
    expect(raw).toContain(`mc_live_${prefix}_`);
    // Not `raw.split("_")` — base64url's alphabet (`A-Za-z0-9-_`) can itself
    // contain `_`, so prefix/secret regularly embed extra underscores and a
    // fixed segment count would be flaky. Instead verify the two fixed
    // label segments plus a non-empty secret tail after the known prefix.
    const afterLabel = raw.slice("mc_live_".length);
    expect(afterLabel.startsWith(`${prefix}_`)).toBe(true);
    const secret = afterLabel.slice(prefix.length + 1);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("returns a hash matching hashApiToken(raw)", () => {
    const { raw, hash } = generateApiToken();
    expect(hash).toBe(hashApiToken(raw));
  });

  it("never repeats a raw token or prefix across calls", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.prefix).not.toBe(b.prefix);
  });
});

describe("hashApiToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashApiToken("mc_live_abc_def")).toBe(hashApiToken("mc_live_abc_def"));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashApiToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("formatApiTokenForDisplay", () => {
  it("masks the secret, keeping only the label and prefix visible", () => {
    expect(formatApiTokenForDisplay("AbC123")).toBe("mc_live_AbC123••••••••");
  });
});

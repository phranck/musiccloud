import { describe, expect, it } from "vitest";
import { formatApiTokenForDisplay, generateApiToken, hashApiToken } from "./api-access-token.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateApiToken", () => {
  it("produces a UUID v4 token", () => {
    const { raw, prefix } = generateApiToken();
    expect(raw).toMatch(UUID_V4_RE);
    // prefix is the first 8 hex chars
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(8);
  });

  it("returns a hash matching hashApiToken(raw)", () => {
    const { raw, hash } = generateApiToken();
    expect(hash).toBe(hashApiToken(raw));
  });

  it("never repeats a raw token or prefix across calls", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("hashApiToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashApiToken("6121de17-1a63-4d44-95f2-ffa17452f715")).toBe(
      hashApiToken("6121de17-1a63-4d44-95f2-ffa17452f715"),
    );
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashApiToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("formatApiTokenForDisplay", () => {
  it("masks the full token, keeping only the prefix visible", () => {
    expect(formatApiTokenForDisplay("6121de17")).toBe("6121de17-...");
  });
});

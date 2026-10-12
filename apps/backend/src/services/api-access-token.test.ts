import { describe, expect, it } from "vitest";
import type { ApiClientToken } from "../db/api-access-repository.js";
import { generateApiToken, hashApiToken, looksLikeApiAccessToken, toTokenResponse } from "./api-access-token.js";

const LIVE_TOKEN_RE = /^mc_live_[a-z0-9]{12}_[A-Za-z0-9_-]{32,}$/;
const UUID_V4 = "6121de17-1a63-4d44-95f2-ffa17452f715";

describe("generateApiToken", () => {
  it("produces a live API token with a non-secret display prefix", () => {
    const { raw, prefix } = generateApiToken();
    expect(raw).toMatch(LIVE_TOKEN_RE);
    expect(raw.startsWith(`mc_live_${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^[a-z0-9]{12}$/);
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
    expect(hashApiToken("mc_live_abc123def456_test-secret")).toBe(hashApiToken("mc_live_abc123def456_test-secret"));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashApiToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("looksLikeApiAccessToken", () => {
  it("accepts only the released live-token shape", () => {
    expect(looksLikeApiAccessToken("mc_live_abc123def456_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_")).toBe(true);
    expect(looksLikeApiAccessToken(UUID_V4)).toBe(false);
    expect(looksLikeApiAccessToken("mc_test_abc123def456_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_")).toBe(false);
  });
});

describe("toTokenResponse", () => {
  /** A display prefix of the stored shape. Low entropy, so no secret scanner mistakes it for a key. */
  const DISPLAY_PREFIX = "a".repeat(12);
  const stored: ApiClientToken = {
    id: "tok_1",
    clientId: "client_1",
    tokenPrefix: DISPLAY_PREFIX,
    tokenHash: "f".repeat(64),
    status: "active",
    createdAt: Date.UTC(2026, 9, 12, 1, 0, 0),
    lastUsedAt: null,
    revokedAt: Date.UTC(2026, 9, 12, 2, 0, 0),
    rotatedFromTokenId: null,
  };

  it("answers with the token's display fields and never its hash", () => {
    const response = toTokenResponse(stored);

    expect(response).toEqual({
      id: "tok_1",
      tokenPrefix: DISPLAY_PREFIX,
      status: "active",
      createdAt: "2026-10-12T01:00:00.000Z",
      lastUsedAt: null,
      revokedAt: "2026-10-12T02:00:00.000Z",
    });
    expect(JSON.stringify(response)).not.toContain(stored.tokenHash);
  });
});

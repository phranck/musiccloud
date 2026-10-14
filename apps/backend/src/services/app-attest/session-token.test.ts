import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SESSION_AUDIENCE,
  APP_SESSION_LIFETIME_SECONDS,
  AppSessionUnconfiguredError,
  assertAppSessionSecret,
  issueAppSessionToken,
  verifyAppSessionToken,
} from "./session-token.js";

const SECRET = "a-session-secret-of-at-least-32-bytes";
const KEY_ID = "zgSY9YSD+7TaDXssY6WlOPVS1K3Lmk+pFhlcSWE+ZV0=";
const ISSUED_AT = new Date("2026-10-14T12:00:00Z");

describe("app session tokens", () => {
  beforeEach(() => {
    vi.stubEnv("APP_SESSION_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues a token that verifies to its key id for seven days", async () => {
    const session = await issueAppSessionToken(KEY_ID, ISSUED_AT);

    expect(session.expiresAt.getTime() - ISSUED_AT.getTime()).toBe(APP_SESSION_LIFETIME_SECONDS * 1000);
    expect(await verifyAppSessionToken(session.token, ISSUED_AT)).toBe(KEY_ID);
    expect(await verifyAppSessionToken(session.token, new Date(session.expiresAt.getTime() - 1000))).toBe(KEY_ID);
  });

  it("refuses the token once it has expired", async () => {
    const session = await issueAppSessionToken(KEY_ID, ISSUED_AT);
    expect(await verifyAppSessionToken(session.token, new Date(session.expiresAt.getTime() + 1000))).toBeNull();
  });

  it("refuses a token signed with another secret", async () => {
    const session = await issueAppSessionToken(KEY_ID, ISSUED_AT);
    vi.stubEnv("APP_SESSION_SECRET", "another-session-secret-of-32-bytes!!");
    expect(await verifyAppSessionToken(session.token, ISSUED_AT)).toBeNull();
  });

  it("refuses a token with the right secret but another audience", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("musiccloud-developer")
      .setSubject(KEY_ID)
      .setIssuedAt(ISSUED_AT)
      .setExpirationTime(new Date(ISSUED_AT.getTime() + 60_000))
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyAppSessionToken(token, ISSUED_AT)).toBeNull();
  });

  it("refuses something that is not a token", async () => {
    expect(await verifyAppSessionToken("not-a-token", ISSUED_AT)).toBeNull();
  });

  it("names its audience", async () => {
    const session = await issueAppSessionToken(KEY_ID, ISSUED_AT);
    const payload = JSON.parse(Buffer.from(session.token.split(".")[1] as string, "base64url").toString("utf8"));
    expect(payload).toMatchObject({ aud: APP_SESSION_AUDIENCE, sub: KEY_ID });
  });

  it("refuses to issue or verify without a usable secret", async () => {
    vi.stubEnv("APP_SESSION_SECRET", "too-short");
    await expect(issueAppSessionToken(KEY_ID, ISSUED_AT)).rejects.toBeInstanceOf(AppSessionUnconfiguredError);
    await expect(verifyAppSessionToken("anything", ISSUED_AT)).rejects.toBeInstanceOf(AppSessionUnconfiguredError);
  });
});

describe("assertAppSessionSecret", () => {
  it("requires a secret of at least 32 bytes in production", () => {
    expect(() => assertAppSessionSecret("production", undefined)).toThrow(AppSessionUnconfiguredError);
    expect(() => assertAppSessionSecret("production", "x".repeat(31))).toThrow(AppSessionUnconfiguredError);
    expect(() => assertAppSessionSecret("production", "x".repeat(32))).not.toThrow();
  });

  it("allows no secret elsewhere but holds a present one to the same length", () => {
    expect(() => assertAppSessionSecret("development", undefined)).not.toThrow();
    expect(() => assertAppSessionSecret("development", "x".repeat(31))).toThrow(AppSessionUnconfiguredError);
    expect(() => assertAppSessionSecret("development", "x".repeat(32))).not.toThrow();
  });
});

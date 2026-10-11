import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  generateEmailToken,
  hashEmailToken,
  hashPassword,
  isDeveloperAccountActive,
  issueDeveloperSession,
  SESSION_MAX_AGE_SECONDS,
  SessionKind,
  sessionCookieOptions,
  verifyPassword,
} from "./developer-auth.js";

describe("developer sessions", () => {
  async function signer() {
    const app = Fastify();
    await app.register(jwt, { secret: "test-developer-session-secret" });
    await app.ready();
    return app;
  }

  it("issues a token that expires with its cookie", async () => {
    const app = await signer();
    const session = issueDeveloperSession({ id: "dev-acc-1", status: "active" }, (payload, options) =>
      app.jwt.sign(payload, options),
    );

    expect(session).not.toBeNull();
    const decoded = app.jwt.decode<{ sub: string; kind: string; iat: number; exp: number }>(session!.token);
    expect(decoded).toMatchObject({ sub: "dev-acc-1", kind: SessionKind.Developer });
    expect(decoded!.exp - decoded!.iat).toBe(SESSION_MAX_AGE_SECONDS);
    expect(session!.cookieOptions).toEqual(sessionCookieOptions());
    expect(session!.cookieOptions.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    await app.close();
  });

  it("issues nothing for an account that is not active", () => {
    let signed = false;
    const session = issueDeveloperSession({ id: "dev-acc-1", status: "suspended" }, () => {
      signed = true;
      return "token";
    });

    expect(session).toBeNull();
    expect(signed).toBe(false);
  });

  it("counts only an active account as one that may hold a session", () => {
    expect(isDeveloperAccountActive({ status: "active" })).toBe(true);
    expect(isDeveloperAccountActive({ status: "suspended" })).toBe(false);
  });
});

describe("developer-auth password hashing", () => {
  it("hashes a password into a bcrypt string that verifies against the original", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toBe("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password against a real hash", async () => {
    const hash = await hashPassword("the-right-one");

    await expect(verifyPassword("the-wrong-one", hash)).resolves.toBe(false);
  });

  it("always returns false (timing-safe) when no hash exists", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
  });

  it("compares against a real cost-12 hash when no hash exists, so the response time does not reveal the account", async () => {
    // bcryptjs answers a malformed hash at once, so only a well-formed one
    // costs what a real comparison costs.
    const compare = vi.spyOn(bcrypt, "compare");
    try {
      await verifyPassword("anything", null);
      expect(compare.mock.calls[0]?.[1]).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
    } finally {
      compare.mockRestore();
    }
  });
});

describe("developer-auth email tokens", () => {
  it("generates a raw token distinct from its hash", () => {
    const { raw, hash } = generateEmailToken();

    expect(raw).toBeTruthy();
    expect(hash).toBeTruthy();
    expect(raw).not.toBe(hash);
  });

  it("derives a hash that matches hashEmailToken(raw)", () => {
    const { raw, hash } = generateEmailToken();

    expect(hashEmailToken(raw)).toBe(hash);
  });

  it("hashes deterministically (same raw → same hash)", () => {
    const { raw } = generateEmailToken();

    expect(hashEmailToken(raw)).toBe(hashEmailToken(raw));
  });

  it("produces unique raw tokens across calls", () => {
    const a = generateEmailToken();
    const b = generateEmailToken();

    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

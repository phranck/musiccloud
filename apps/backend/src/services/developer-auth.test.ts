import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  clearedInvitationPassCookieOptions,
  generateEmailToken,
  hashEmailToken,
  hashPassword,
  INVITATION_PASS_MAX_AGE_SECONDS,
  isDeveloperAccountActive,
  issueDeveloperSession,
  issueInvitationPass,
  readInvitationPass,
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

describe("invitation passes", () => {
  async function signer() {
    const app = Fastify();
    await app.register(jwt, { secret: "test-invitation-pass-secret" });
    await app.ready();
    return app;
  }

  it("names the invitation it was issued for, and lives a day in its cookie", async () => {
    const app = await signer();
    const pass = issueInvitationPass("invitation-1", (payload, options) => app.jwt.sign(payload, options));

    expect(readInvitationPass(pass.token, (token) => app.jwt.verify(token))).toBe("invitation-1");
    const decoded = app.jwt.decode<{ iat: number; exp: number }>(pass.token);
    expect(decoded!.exp - decoded!.iat).toBe(INVITATION_PASS_MAX_AGE_SECONDS);
    expect(pass.cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(pass.cookieOptions.maxAge).toBe(INVITATION_PASS_MAX_AGE_SECONDS);
    expect(clearedInvitationPassCookieOptions().maxAge).toBe(0);
    await app.close();
  });

  it("refuses a session token in its place, because the kinds differ", async () => {
    const app = await signer();
    const session = issueDeveloperSession({ id: "dev-acc-1", status: "active" }, (payload, options) =>
      app.jwt.sign(payload, options),
    );

    expect(readInvitationPass(session!.token, (token) => app.jwt.verify(token))).toBeNull();
    await app.close();
  });

  it("refuses a pass signed with another key, a garbled one, and none at all", async () => {
    const app = await signer();
    const elsewhere = await (async () => {
      const other = Fastify();
      await other.register(jwt, { secret: "somebody-elses-secret" });
      await other.ready();
      const token = issueInvitationPass("invitation-1", (payload, options) => other.jwt.sign(payload, options)).token;
      await other.close();
      return token;
    })();
    const verify = (token: string) => app.jwt.verify(token);

    expect(readInvitationPass(elsewhere, verify)).toBeNull();
    expect(readInvitationPass("not-a-token", verify)).toBeNull();
    expect(readInvitationPass(undefined, verify)).toBeNull();
    await app.close();
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

import { describe, expect, it, vi } from "vitest";

import type { AdminUser } from "../db/admin-repository.js";
import {
  ADMIN_TOKEN_LIFETIME,
  ADMIN_TOKEN_ROLE,
  type AdminTokenSigner,
  buildAdminUserResponse,
  readAdminTokenSubject,
  signAdminToken,
} from "./admin-session.js";

/** The token the fake signer hands back. */
const SIGNED_TOKEN = "signed-token";

/**
 * A stored admin user with every column set, sensitive ones included.
 *
 * @param overrides - Columns that differ from the default owner.
 * @returns The row.
 */
function makeAdmin(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "admin-1",
    username: "owner",
    passwordHash: "hashed-password",
    email: "owner@example.com",
    role: "owner",
    firstName: "Ada",
    lastName: "Lovelace",
    avatarUrl: null,
    sessionTimeoutMinutes: 30,
    createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    lastLoginAt: Date.UTC(2026, 1, 3, 4, 5, 6),
    ...overrides,
  };
}

describe("signAdminToken", () => {
  it("signs the gate's role claim, the stored role and the session lifetime", () => {
    const sign = vi.fn<Parameters<AdminTokenSigner>, ReturnType<AdminTokenSigner>>().mockReturnValue(SIGNED_TOKEN);

    const token = signAdminToken(sign, makeAdmin({ role: "moderator" }));

    expect(token).toBe(SIGNED_TOKEN);
    expect(sign).toHaveBeenCalledWith(
      { sub: "admin-1", username: "owner", role: ADMIN_TOKEN_ROLE, dbRole: "moderator" },
      { expiresIn: ADMIN_TOKEN_LIFETIME },
    );
  });
});

describe("buildAdminUserResponse", () => {
  it("sends the safe fields with ISO timestamps and nothing else", () => {
    expect(buildAdminUserResponse(makeAdmin())).toEqual({
      id: "admin-1",
      username: "owner",
      email: "owner@example.com",
      role: "owner",
      isOwner: true,
      firstName: "Ada",
      lastName: "Lovelace",
      avatarUrl: null,
      sessionTimeoutMinutes: 30,
      createdAt: "2026-01-02T03:04:05.000Z",
      lastLoginAt: "2026-02-03T04:05:06.000Z",
    });
  });

  it("leaves a missing address and a missing sign-in out", () => {
    const response = buildAdminUserResponse(makeAdmin({ role: "admin", email: null, lastLoginAt: null }));

    expect(response.email).toBeUndefined();
    expect(response.lastLoginAt).toBeNull();
    expect(response.isOwner).toBe(false);
  });
});

describe("readAdminTokenSubject", () => {
  it.each([
    ["a payload with a subject", { sub: "admin-1", role: "admin" }, "admin-1"],
    ["a payload without one", { role: "admin" }, null],
    ["an empty subject", { sub: "" }, null],
    ["no payload", undefined, null],
  ])("reads %s", (_case, payload, expected) => {
    expect(readAdminTokenSubject(payload)).toBe(expected);
  });
});

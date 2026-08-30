import { describe, expect, it } from "vitest";
import type { ApiTokenDto } from "./apiAccessClient";
import {
  initialRegistrationTokensState,
  RegistrationTokensActionType,
  registrationTokensReducer,
  toTokenFailure,
} from "./registrationTokensState";

/** Obviously not a key: a real one never reaches this repository, not even as a fixture. */
const ISSUED_VALUE = "mc_live_examplepref_example-only";

function makeToken(overrides: Partial<ApiTokenDto> = {}): ApiTokenDto {
  return {
    id: "token-1",
    tokenPrefix: "examplepref",
    status: "active",
    createdAt: "2026-08-30T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("registrationTokensReducer", () => {
  it("reveals a created key once and keeps it nowhere else", () => {
    const created = registrationTokensReducer(initialRegistrationTokensState([]), {
      type: RegistrationTokensActionType.TokenCreated,
      token: makeToken({ rawToken: ISSUED_VALUE }),
    });

    expect(created.reveal?.value).toBe(ISSUED_VALUE);

    const dismissed = registrationTokensReducer(created, { type: RegistrationTokensActionType.RevealDismissed });

    expect(dismissed.reveal).toBeNull();
    // Once dismissed the value is gone from the model entirely, which is what
    // makes the reveal a one-time reveal rather than a hidden field.
    expect(JSON.stringify(dismissed)).not.toContain("example-only");
  });

  it("retires the previous key when one is rotated", () => {
    const loaded = initialRegistrationTokensState([makeToken()]);

    const rotated = registrationTokensReducer(loaded, {
      type: RegistrationTokensActionType.TokenRotated,
      previousTokenId: "token-1",
      token: makeToken({ id: "token-2", rawToken: ISSUED_VALUE }),
    });

    expect(rotated.tokens.map((token) => [token.id, token.status])).toEqual([
      ["token-2", "active"],
      ["token-1", "rotated"],
    ]);
    expect(rotated.reveal?.value).toBe(ISSUED_VALUE);
  });

  it("replaces the revoked key rather than dropping it from the list", () => {
    const loaded = initialRegistrationTokensState([makeToken()]);

    const revoked = registrationTokensReducer(loaded, {
      type: RegistrationTokensActionType.TokenRevoked,
      token: makeToken({ status: "revoked", revokedAt: "2026-08-30T01:00:00.000Z" }),
    });

    expect(revoked.tokens).toHaveLength(1);
    expect(revoked.tokens[0]?.status).toBe("revoked");
    expect(revoked.pendingRevokeId).toBeNull();
  });

  it("takes the reveal down when the key it is showing is revoked", () => {
    const created = registrationTokensReducer(initialRegistrationTokensState([]), {
      type: RegistrationTokensActionType.TokenCreated,
      token: makeToken({ rawToken: ISSUED_VALUE }),
    });

    const revoked = registrationTokensReducer(created, {
      type: RegistrationTokensActionType.TokenRevoked,
      token: makeToken({ status: "revoked" }),
    });

    // Leaving it up would show a quickstart telling somebody to use a key that
    // has just stopped working.
    expect(revoked.reveal).toBeNull();
  });

  it("leaves the reveal alone when a different key is revoked", () => {
    const created = registrationTokensReducer(initialRegistrationTokensState([makeToken({ id: "token-9" })]), {
      type: RegistrationTokensActionType.TokenCreated,
      token: makeToken({ rawToken: ISSUED_VALUE }),
    });

    const revoked = registrationTokensReducer(created, {
      type: RegistrationTokensActionType.TokenRevoked,
      token: makeToken({ id: "token-9", status: "revoked" }),
    });

    expect(revoked.reveal?.value).toBe(ISSUED_VALUE);
  });

  it("asks once before revoking, and lets the developer back out", () => {
    const loaded = initialRegistrationTokensState([makeToken()]);

    const armed = registrationTokensReducer(loaded, {
      type: RegistrationTokensActionType.RevokeArmed,
      tokenId: "token-1",
    });
    expect(armed.pendingRevokeId).toBe("token-1");

    const disarmed = registrationTokensReducer(armed, { type: RegistrationTokensActionType.RevokeDisarmed });
    expect(disarmed.pendingRevokeId).toBeNull();
  });

  it("carries the throttle's code, error id and retry window", () => {
    const failure = toTokenFailure({
      ok: false,
      status: 429,
      code: "MC-API-0003",
      message: "Too many requests.",
      errorId: "9d2b",
      retryAfterSeconds: 42,
    });

    expect(failure).toEqual({
      code: "MC-API-0003",
      message: "Too many requests.",
      errorId: "9d2b",
      retryAfterSeconds: 42,
    });
  });

  it("never puts a key value into a failure", () => {
    const state = registrationTokensReducer(initialRegistrationTokensState([]), {
      type: RegistrationTokensActionType.MutationFailed,
      failure: toTokenFailure({ ok: false, status: 500, code: "MC-SYS-0001", message: "Server error.", errorId: "x" }),
    });

    expect(JSON.stringify(state)).not.toContain("mc_live_");
  });
});

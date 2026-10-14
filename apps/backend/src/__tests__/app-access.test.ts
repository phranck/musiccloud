/**
 * @file The Apple app's routes under `/api/app/`, through the real server.
 *
 * The rows live in memory here, so the store is replaced. The attestation
 * check is replaced too, because Apple's sample was made with a challenge
 * hashed differently from this protocol and for another App ID; its
 * verification is covered in `services/app-attest/verify.test.ts`. Assertions
 * are verified for real, signed with a key the test generates.
 */
import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { type CBORType, encodeCBOR } from "@levischuck/tiny-cbor";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  challenges: new Map<string, Date>(),
  keys: new Map<
    string,
    { publicKey: Buffer; signCount: number; environment: "production" | "development"; revoked: boolean }
  >(),
  issued: 0,
}));

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({})),
  getCcRepository: vi.fn(async () => ({})),
  getApiAccessRepository: vi.fn(async () => ({})),
  getDeveloperRepository: vi.fn(async () => ({})),
}));

vi.mock("../services/app-attest/store.js", () => ({
  issueAppAttestChallenge: vi.fn(async (now: Date) => {
    state.issued += 1;
    const challenge = createHash("sha256").update(`challenge-${state.issued}`).digest("base64url").slice(0, 43);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    state.challenges.set(challenge, expiresAt);
    return { challenge, expiresAt };
  }),
  consumeAppAttestChallenge: vi.fn(async (challenge: string, now: Date) => {
    const expiresAt = state.challenges.get(challenge);
    state.challenges.delete(challenge);
    return expiresAt !== undefined && expiresAt.getTime() > now.getTime();
  }),
  storeAttestedKey: vi.fn(
    async (key: { keyId: string; publicKey: Buffer; environment: "production" | "development" }) => {
      if (state.keys.has(key.keyId)) return false;
      state.keys.set(key.keyId, {
        publicKey: key.publicKey,
        signCount: 0,
        environment: key.environment,
        revoked: false,
      });
      return true;
    },
  ),
  findActiveAttestedKey: vi.fn(async (keyId: string) => {
    const key = state.keys.get(keyId);
    return key && !key.revoked
      ? { publicKey: key.publicKey, signCount: key.signCount, environment: key.environment }
      : null;
  }),
  isAttestedKeyActive: vi.fn(async (keyId: string) => {
    const key = state.keys.get(keyId);
    return key !== undefined && !key.revoked;
  }),
  advanceAttestedKeyCounter: vi.fn(async (keyId: string, counter: number) => {
    const key = state.keys.get(keyId);
    if (!key || key.revoked || key.signCount >= counter) return false;
    key.signCount = counter;
    return true;
  }),
}));

const verification = vi.hoisted(() => ({ publicKey: Buffer.alloc(0), refuse: false }));

vi.mock("../services/app-attest/verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/app-attest/verify.js")>();
  return {
    ...original,
    verifyAttestation: vi.fn(() => {
      if (verification.refuse) throw new original.AppAttestVerificationError("nonce");
      return {
        publicKey: verification.publicKey,
        environment: "development",
        platform: "iphoneos",
        receipt: Buffer.from("receipt"),
        extensions: { validationCategory: 3 },
      };
    }),
  };
});

const resolveCalls = vi.hoisted(() => ({ bodies: [] as unknown[] }));

vi.mock("../routes/resolve.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../routes/resolve.js")>();
  return {
    ...original,
    respondToResolveRequest: vi.fn(async (reply: import("fastify").FastifyReply, body: unknown) => {
      resolveCalls.bodies.push(body);
      return reply.send({ status: "disambiguation", candidates: [] });
    }),
  };
});

import { buildApp } from "../server.js";
import { MUSICCLOUD_APP_ID } from "../services/app-attest/policy.js";

const SECRET = "app-access-test-secret-of-32-bytes!!";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-app-access";
  vi.stubEnv("APP_SESSION_SECRET", SECRET);
  app = await buildApp();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
});

beforeEach(() => {
  state.challenges.clear();
  state.keys.clear();
  verification.refuse = false;
  resolveCalls.bodies = [];
});

function sha256(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}

/** A device key and its id, standing in for one App Attest created. */
function createDeviceKey(): { privateKey: KeyObject; point: Buffer; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x as string, "base64url"),
    Buffer.from(jwk.y as string, "base64url"),
  ]);
  return { privateKey, point, keyId: sha256(point).toString("base64") };
}

/** An assertion over `challenge`, signed the way App Attest signs one. */
function createAssertion(privateKey: KeyObject, counter: number, challenge: string): string {
  const counterBytes = Buffer.alloc(4);
  counterBytes.writeUInt32BE(counter);
  const authenticatorData = Buffer.concat([sha256(MUSICCLOUD_APP_ID), Buffer.from([0x40]), counterBytes]);
  const nonce = sha256(Buffer.concat([authenticatorData, sha256(challenge)]));
  const signature = sign("sha256", nonce, privateKey);
  const assertion = encodeCBOR(
    new Map<string, CBORType>([
      ["signature", new Uint8Array(signature)],
      ["authenticatorData", new Uint8Array(authenticatorData)],
    ]),
  );
  return Buffer.from(assertion).toString("base64");
}

async function requestChallenge(): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/app/challenge" });
  expect(response.statusCode).toBe(200);
  return response.json().challenge;
}

/** Attests a fresh key and returns it with its session token. */
async function attest() {
  const device = createDeviceKey();
  verification.publicKey = device.point;
  const response = await app.inject({
    method: "POST",
    url: "/api/app/attest",
    payload: {
      keyId: device.keyId,
      attestation: Buffer.from("attestation").toString("base64"),
      challenge: await requestChallenge(),
    },
  });
  expect(response.statusCode).toBe(200);
  return { ...device, token: response.json().token as string };
}

describe("POST /api/app/challenge", () => {
  it("issues a 43-character base64url challenge that expires in five minutes, never cached", async () => {
    const response = await app.inject({ method: "POST", url: "/api/app/challenge" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json();
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
  });

  it("carries its own limit of 20 per minute", async () => {
    const response = await app.inject({ method: "POST", url: "/api/app/challenge", remoteAddress: "10.0.0.20" });
    expect(response.headers["x-ratelimit-limit"]).toBe("20");
  });
});

describe("POST /api/app/attest", () => {
  it("stores the key with counter 0 and returns a seven-day session", async () => {
    const { keyId, token } = await attest();

    expect(state.keys.get(keyId)?.signCount).toBe(0);
    const payload = JSON.parse(Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8"));
    expect(payload.aud).toBe("musiccloud-apple-app");
    expect(payload.sub).toBe(keyId);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("refuses a challenge that was already used", async () => {
    const device = createDeviceKey();
    verification.publicKey = device.point;
    const challenge = await requestChallenge();
    const payload = { keyId: device.keyId, attestation: "YXR0ZXN0YXRpb24=", challenge };

    expect((await app.inject({ method: "POST", url: "/api/app/attest", payload })).statusCode).toBe(200);
    const replay = await app.inject({ method: "POST", url: "/api/app/attest", payload });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toBe("MC-AUTH-0006");
    expect(replay.headers["cache-control"]).toBe("no-store");
  });

  it("refuses an attestation that does not verify", async () => {
    verification.refuse = true;
    const device = createDeviceKey();
    const response = await app.inject({
      method: "POST",
      url: "/api/app/attest",
      payload: { keyId: device.keyId, attestation: "YXR0ZXN0YXRpb24=", challenge: await requestChallenge() },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("MC-AUTH-0007");
    expect(state.keys.has(device.keyId)).toBe(false);
  });

  it("refuses to attest a stored key a second time", async () => {
    const { keyId, point } = await attest();
    verification.publicKey = point;
    const response = await app.inject({
      method: "POST",
      url: "/api/app/attest",
      payload: { keyId, attestation: "YXR0ZXN0YXRpb24=", challenge: await requestChallenge() },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("MC-REQ-0009");
  });

  it.each([
    ["a key id that is not 32 bytes of base64", { keyId: "short=" }],
    ["an attestation that is not base64", { attestation: "not base64!" }],
    ["an attestation above 8 KiB", { attestation: "A".repeat(10_928) }],
    ["a challenge of the wrong length", { challenge: "abc" }],
  ])("refuses %s", async (_label, override) => {
    const device = createDeviceKey();
    const response = await app.inject({
      method: "POST",
      url: "/api/app/attest",
      payload: { keyId: device.keyId, attestation: "YXR0ZXN0YXRpb24=", challenge: "a".repeat(43), ...override },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/app/session", () => {
  it("renews the session with an assertion whose counter grows, and refuses a replay", async () => {
    const { keyId, privateKey } = await attest();

    const challenge = await requestChallenge();
    const first = await app.inject({
      method: "POST",
      url: "/api/app/session",
      payload: { keyId, assertion: createAssertion(privateKey, 1, challenge), challenge },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().token).toEqual(expect.any(String));
    expect(state.keys.get(keyId)?.signCount).toBe(1);

    const nextChallenge = await requestChallenge();
    const replay = await app.inject({
      method: "POST",
      url: "/api/app/session",
      payload: { keyId, assertion: createAssertion(privateKey, 1, nextChallenge), challenge: nextChallenge },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toBe("MC-AUTH-0007");
  });

  it("refuses an assertion over another challenge", async () => {
    const { keyId, privateKey } = await attest();
    const challenge = await requestChallenge();
    const response = await app.inject({
      method: "POST",
      url: "/api/app/session",
      payload: { keyId, assertion: createAssertion(privateKey, 1, "a-different-challenge"), challenge },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("MC-AUTH-0007");
  });

  it("refuses a key that was never attested or was revoked", async () => {
    const { keyId, privateKey } = await attest();
    const entry = state.keys.get(keyId);
    if (entry) entry.revoked = true;

    const challenge = await requestChallenge();
    const response = await app.inject({
      method: "POST",
      url: "/api/app/session",
      payload: { keyId, assertion: createAssertion(privateKey, 1, challenge), challenge },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("MC-AUTH-0008");
  });
});

describe("POST /api/app/resolve", () => {
  const url = "/api/app/resolve";
  const payload = { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" };

  it("resolves for a valid session, without any rate limit and never cached", async () => {
    const { token } = await attest();

    for (let request = 0; request < 15; request += 1) {
      const response = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "10.0.1.1",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(resolveCalls.bodies).toHaveLength(15);
    expect(resolveCalls.bodies[0]).toEqual(payload);
  });

  it("refuses a request without a session, and counts it against 10 per minute", async () => {
    const statuses: number[] = [];
    for (let request = 0; request < 11; request += 1) {
      const response = await app.inject({ method: "POST", url, payload, remoteAddress: "10.0.1.2" });
      statuses.push(response.statusCode);
      if (request === 0) {
        expect(response.json().error).toBe("MC-AUTH-0005");
        expect(response.headers["x-ratelimit-limit"]).toBe("10");
        expect(response.headers["cache-control"]).toBe("no-store");
      }
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
    expect(resolveCalls.bodies).toHaveLength(0);
  });

  it("does not exempt a forged or foreign token", async () => {
    const { token } = await attest();
    const [header, body] = token.split(".");
    const forged = `${header}.${body}.${"A".repeat(43)}`;
    const response = await app.inject({
      method: "POST",
      url,
      payload,
      remoteAddress: "10.0.1.3",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers["x-ratelimit-limit"]).toBe("10");
  });

  it("refuses a valid token whose key has been revoked", async () => {
    const { keyId, token } = await attest();
    const entry = state.keys.get(keyId);
    if (entry) entry.revoked = true;

    const response = await app.inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("MC-AUTH-0005");
  });

  it("refuses a query above 2048 characters for a valid session", async () => {
    const { token } = await attest();
    const response = await app.inject({
      method: "POST",
      url,
      payload: { query: "q".repeat(2049) },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("the public API document", () => {
  it("lists none of the app routes", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("/api/app/");
  });
});

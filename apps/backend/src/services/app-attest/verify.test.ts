/**
 * @file App Attest verification against Apple's published sample attestation,
 * and against assertions signed here with a key of the test's own.
 */
import { createHash, generateKeyPairSync, type KeyObject, sign, X509Certificate } from "node:crypto";
import { type CBORType, encodeCBOR } from "@levischuck/tiny-cbor";
import { describe, expect, it } from "vitest";
import { APPLE_APP_ATTESTATION_ROOT_CA_PEM, APPLE_APP_ATTESTATION_ROOT_CA_SHA256 } from "./apple-root-ca.js";
import {
  APPLE_SAMPLE_APP_ID,
  APPLE_SAMPLE_ATTESTATION,
  APPLE_SAMPLE_CHALLENGE,
  APPLE_SAMPLE_KEY_ID,
  APPLE_SAMPLE_VALID_AT,
} from "./apple-sample.fixture.js";
import {
  type AppAttestPolicy,
  buildAppAttestPolicy,
  DEVELOPMENT_AAGUID,
  MUSICCLOUD_APP_ID,
  PRODUCTION_AAGUID,
} from "./policy.js";
import {
  type AppAttestFailureReason,
  aclBlobRuleHolds,
  MACOS_REQUIRED_ACL_BLOB,
  verifyAssertion,
  verifyAttestation,
} from "./verify.js";

/** The launch category Apple's sample reports: an operating system executable. */
const SAMPLE_VALIDATION_CATEGORY = 1;

const samplePolicy: AppAttestPolicy = {
  appIds: [APPLE_SAMPLE_APP_ID],
  environments: [{ environment: "production", aaguid: PRODUCTION_AAGUID }],
  validationCategories: [SAMPLE_VALIDATION_CATEGORY],
};

function sha256(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}

function sampleInput(overrides: Partial<Parameters<typeof verifyAttestation>[0]> = {}) {
  return {
    attestationObject: Buffer.from(APPLE_SAMPLE_ATTESTATION, "base64"),
    keyId: Buffer.from(APPLE_SAMPLE_KEY_ID, "base64"),
    clientDataHash: Buffer.from(APPLE_SAMPLE_CHALLENGE, "utf8"),
    policy: samplePolicy,
    now: APPLE_SAMPLE_VALID_AT,
    ...overrides,
  };
}

function expectRefusal(verification: () => unknown, reason: AppAttestFailureReason): void {
  expect(verification).toThrowError(expect.objectContaining({ name: "AppAttestVerificationError", reason }));
}

describe("the pinned root", () => {
  it("has the fingerprint stated beside it", () => {
    expect(new X509Certificate(APPLE_APP_ATTESTATION_ROOT_CA_PEM).fingerprint256).toBe(
      APPLE_APP_ATTESTATION_ROOT_CA_SHA256,
    );
  });
});

describe("verifyAttestation with Apple's sample", () => {
  it("accepts the sample and returns the key whose hash is the key id", () => {
    const result = verifyAttestation(sampleInput());

    expect(sha256(result.publicKey).toString("base64")).toBe(APPLE_SAMPLE_KEY_ID);
    expect(result.publicKey).toHaveLength(65);
    expect(result.environment).toBe("production");
    expect(result.platform).toBe("iphoneos");
    expect(result.extensions.validationCategory).toBe(SAMPLE_VALIDATION_CATEGORY);
    expect(result.receipt.length).toBeGreaterThan(0);
  });

  it("refuses it once the credential certificate has expired", () => {
    expectRefusal(() => verifyAttestation(sampleInput({ now: new Date("2026-04-24T00:00:00Z") })), "certificate_chain");
  });

  it("refuses it before the credential certificate is valid", () => {
    expectRefusal(() => verifyAttestation(sampleInput({ now: new Date("2026-04-20T00:00:00Z") })), "certificate_chain");
  });

  it("refuses a different challenge", () => {
    expectRefusal(
      () => verifyAttestation(sampleInput({ clientDataHash: Buffer.from("another_challenge", "utf8") })),
      "nonce",
    );
  });

  it("refuses the hash of the challenge where the sample signed the challenge itself", () => {
    expectRefusal(() => verifyAttestation(sampleInput({ clientDataHash: sha256(APPLE_SAMPLE_CHALLENGE) })), "nonce");
  });

  it("refuses a key id that is not the hash of the certified key", () => {
    expectRefusal(() => verifyAttestation(sampleInput({ keyId: Buffer.alloc(32, 7) })), "key_id");
  });

  it("refuses an App ID it was not made for", () => {
    expectRefusal(
      () => verifyAttestation(sampleInput({ policy: { ...samplePolicy, appIds: [MUSICCLOUD_APP_ID] } })),
      "rp_id",
    );
  });

  it("refuses a production key where only development keys are accepted", () => {
    const developmentOnly: AppAttestPolicy = {
      ...samplePolicy,
      environments: [{ environment: "development", aaguid: DEVELOPMENT_AAGUID }],
    };
    expectRefusal(() => verifyAttestation(sampleInput({ policy: developmentOnly })), "environment");
  });

  it("refuses a launch category the policy does not accept", () => {
    expectRefusal(
      () => verifyAttestation(sampleInput({ policy: { ...samplePolicy, validationCategories: [4] } })),
      "validation_category",
    );
  });

  it("refuses bytes that are not an attestation object", () => {
    expectRefusal(() => verifyAttestation(sampleInput({ attestationObject: Buffer.from("not cbor") })), "malformed");
  });

  it("refuses the sample with one byte of its authenticator data changed", () => {
    const tampered = Buffer.from(APPLE_SAMPLE_ATTESTATION, "base64");
    // The authenticator data closes the object, so its last byte belongs to it.
    tampered[tampered.length - 1] ^= 0x01;
    expect(() => verifyAttestation(sampleInput({ attestationObject: tampered }))).toThrowError(
      expect.objectContaining({ name: "AppAttestVerificationError" }),
    );
  });
});

describe("aclBlobRuleHolds", () => {
  it("exempts a certificate that names iOS", () => {
    expect(aclBlobRuleHolds("iphoneos", Buffer.from("anything"))).toBe(true);
    expect(aclBlobRuleHolds("iphoneos", null)).toBe(true);
  });

  it("requires Apple's value everywhere else", () => {
    expect(aclBlobRuleHolds("macosx", MACOS_REQUIRED_ACL_BLOB)).toBe(true);
    expect(aclBlobRuleHolds(null, MACOS_REQUIRED_ACL_BLOB)).toBe(true);
    expect(aclBlobRuleHolds("macosx", Buffer.from("other"))).toBe(false);
    expect(aclBlobRuleHolds("macosx", null)).toBe(false);
    expect(aclBlobRuleHolds(null, null)).toBe(false);
  });
});

/** A device key of the test's own, standing in for one App Attest holds. */
function createDeviceKey(): { privateKey: KeyObject; point: Buffer } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x as string, "base64url"),
    Buffer.from(jwk.y as string, "base64url"),
  ]);
  return { privateKey, point };
}

/**
 * Builds an assertion object the way App Attest lays one out: authenticator
 * data with the RP ID hash, a flags byte and the counter, and an ECDSA
 * signature over the SHA-256 of that data and the client data hash.
 */
function createAssertion(options: {
  privateKey: KeyObject;
  counter: number;
  clientDataHash: Buffer;
  appId?: string;
  extensions?: Map<string | number, CBORType>;
}): Uint8Array {
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(options.counter);
  const authenticatorData = Buffer.concat([
    sha256(options.appId ?? MUSICCLOUD_APP_ID),
    Buffer.from([0x40]),
    counter,
    options.extensions ? Buffer.from(encodeCBOR(options.extensions)) : Buffer.alloc(0),
  ]);
  const nonce = sha256(Buffer.concat([authenticatorData, options.clientDataHash]));
  const signature = sign("sha256", nonce, options.privateKey);
  return encodeCBOR(
    new Map<string, CBORType>([
      ["signature", new Uint8Array(signature)],
      ["authenticatorData", new Uint8Array(authenticatorData)],
    ]),
  );
}

describe("verifyAssertion", () => {
  const productionPolicy = buildAppAttestPolicy("production");
  const clientDataHash = sha256("a-challenge");

  it("accepts an assertion with a counter above the stored one and returns it", () => {
    const { privateKey, point } = createDeviceKey();
    const assertionObject = createAssertion({ privateKey, counter: 3, clientDataHash });

    const result = verifyAssertion({
      assertionObject,
      clientDataHash,
      publicKey: point,
      previousCounter: 2,
      policy: productionPolicy,
    });

    expect(result.counter).toBe(3);
  });

  it("refuses a counter that does not grow", () => {
    const { privateKey, point } = createDeviceKey();
    for (const counter of [0, 2]) {
      const assertionObject = createAssertion({ privateKey, counter, clientDataHash });
      expectRefusal(
        () =>
          verifyAssertion({
            assertionObject,
            clientDataHash,
            publicKey: point,
            previousCounter: 2,
            policy: productionPolicy,
          }),
        "counter",
      );
    }
  });

  it("refuses a first assertion whose counter is 0", () => {
    const { privateKey, point } = createDeviceKey();
    const assertionObject = createAssertion({ privateKey, counter: 0, clientDataHash });
    expectRefusal(
      () =>
        verifyAssertion({
          assertionObject,
          clientDataHash,
          publicKey: point,
          previousCounter: 0,
          policy: productionPolicy,
        }),
      "counter",
    );
  });

  it("refuses an assertion over different client data", () => {
    const { privateKey, point } = createDeviceKey();
    const assertionObject = createAssertion({ privateKey, counter: 1, clientDataHash });
    expectRefusal(
      () =>
        verifyAssertion({
          assertionObject,
          clientDataHash: sha256("another-challenge"),
          publicKey: point,
          previousCounter: 0,
          policy: productionPolicy,
        }),
      "signature",
    );
  });

  it("refuses an assertion signed by another key", () => {
    const signer = createDeviceKey();
    const stored = createDeviceKey();
    const assertionObject = createAssertion({ privateKey: signer.privateKey, counter: 1, clientDataHash });
    expectRefusal(
      () =>
        verifyAssertion({
          assertionObject,
          clientDataHash,
          publicKey: stored.point,
          previousCounter: 0,
          policy: productionPolicy,
        }),
      "signature",
    );
  });

  it("refuses an assertion from another app", () => {
    const { privateKey, point } = createDeviceKey();
    const assertionObject = createAssertion({ privateKey, counter: 1, clientDataHash, appId: APPLE_SAMPLE_APP_ID });
    expectRefusal(
      () =>
        verifyAssertion({
          assertionObject,
          clientDataHash,
          publicKey: point,
          previousCounter: 0,
          policy: productionPolicy,
        }),
      "rp_id",
    );
  });

  it("refuses a development build in production and accepts it elsewhere", () => {
    const { privateKey, point } = createDeviceKey();
    const developmentCategory = new Uint8Array([3, 0, 0, 0]);
    const assertionObject = createAssertion({
      privateKey,
      counter: 1,
      clientDataHash,
      extensions: new Map<string, CBORType>([["apple_validation_category_01", developmentCategory]]),
    });
    const input = { assertionObject, clientDataHash, publicKey: point, previousCounter: 0 };

    expectRefusal(() => verifyAssertion({ ...input, policy: productionPolicy }), "validation_category");
    expect(verifyAssertion({ ...input, policy: buildAppAttestPolicy("development") }).extensions).toEqual({
      validationCategory: 3,
    });
  });

  it("refuses bytes that are not an assertion object", () => {
    const { point } = createDeviceKey();
    expectRefusal(
      () =>
        verifyAssertion({
          assertionObject: Buffer.from("not cbor"),
          clientDataHash,
          publicKey: point,
          previousCounter: 0,
          policy: productionPolicy,
        }),
      "malformed",
    );
  });
});

describe("buildAppAttestPolicy", () => {
  it("accepts only Apple's production environment in production", () => {
    const policy = buildAppAttestPolicy("production");
    expect(policy.appIds).toEqual([MUSICCLOUD_APP_ID]);
    expect(policy.environments.map((entry) => entry.environment)).toEqual(["production"]);
    expect(PRODUCTION_AAGUID.equals(Buffer.from("appattest\0\0\0\0\0\0\0", "latin1"))).toBe(true);
  });

  it("also accepts the development environment outside production", () => {
    const policy = buildAppAttestPolicy("development");
    expect(policy.environments.map((entry) => entry.environment)).toEqual(["production", "development"]);
    expect(DEVELOPMENT_AAGUID.toString("latin1")).toBe("appattestdevelop");
  });
});

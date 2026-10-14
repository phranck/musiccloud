/**
 * @file Verifies App Attest attestations and assertions exactly as Apple's
 * "Validating apps that connect to your server" lists the steps.
 *
 * Both functions are pure: everything they compare against arrives as an
 * argument, including the moment certificates are judged against, so a test
 * can verify Apple's published sample long after its leaf certificate expired.
 * Neither touches the database, which is where the caller keeps the challenge,
 * the key and its counter.
 */
import { createHash, createPublicKey, verify as verifySignature, X509Certificate } from "node:crypto";
import { type CBORType, decodeCBOR } from "@levischuck/tiny-cbor";
import { APPLE_APP_ATTESTATION_ROOT_CA_PEM } from "./apple-root-ca.js";
import {
  type AppAttestExtensions,
  readAssertionAuthenticatorData,
  readAttestationAuthenticatorData,
} from "./authenticator-data.js";
import {
  ACL_BLOB_EXTENSION_OID,
  NONCE_EXTENSION_OID,
  OPERATING_SYSTEM_EXTENSION_OID,
  readAttestedPlatform,
  readCertificateExtension,
  readSingleOctetString,
} from "./certificate.js";
import type { AppAttestEnvironment, AppAttestPolicy } from "./policy.js";

/** The attestation statement format App Attest uses. */
const ATTESTATION_FORMAT = "apple-appattest";

/**
 * The only `aclBlob` content a macOS key may carry. Apple states that it
 * stands for the key's access policy with System Integrity Protection and full
 * security mode enabled, and that it does not change across macOS versions.
 */
export const MACOS_REQUIRED_ACL_BLOB = Buffer.from(
  "MEAMAjExMDowCQwCb2uhAwEB/zAJDAJvYaEDAQH/MAsMBG9kZWyhAwEB/zAVDARvc2duoAYMBHJzZWMwBaYDAgEB",
  "base64",
);

/**
 * The platform name under which an attestation is exempt from the macOS
 * `aclBlob` rule. Apple's sample attestation from iOS carries this name, and an
 * `aclBlob` that differs from {@link MACOS_REQUIRED_ACL_BLOB}, so iOS keys
 * cannot be held to that rule. Any other name, and a missing one, keeps the
 * rule in force, so an unrecognised platform is refused rather than waved
 * through.
 */
const IOS_PLATFORM_NAME = "iphoneos";

/** Length of an uncompressed P-256 point: the `04` prefix and two 32-byte coordinates. */
const UNCOMPRESSED_P256_POINT_LENGTH = 65;

/** COSE labels of an EC2 key, as RFC 8152 numbers them. */
const COSE_KEY_TYPE = 1;
const COSE_ALGORITHM = 3;
const COSE_CURVE = -1;
const COSE_X = -2;
const COSE_Y = -3;
const COSE_KEY_TYPE_EC2 = 2;
const COSE_ALGORITHM_ES256 = -7;
const COSE_CURVE_P256 = 1;

/** Which step of Apple's procedure refused the object, for logs and for the caller's reply. */
export type AppAttestFailureReason =
  | "malformed"
  | "certificate_chain"
  | "nonce"
  | "acl_blob"
  | "key_id"
  | "credential_key"
  | "rp_id"
  | "counter"
  | "environment"
  | "credential_id"
  | "validation_category"
  | "signature";

/** An attestation or assertion that failed one of Apple's steps. */
export class AppAttestVerificationError extends Error {
  /**
   * @param reason - The step that failed. Safe to log, because it names a
   *   check and carries none of the object's content.
   * @param platform - The platform the credential certificate names, set
   *   where the `aclBlob` rule refused it, so a log shows which platform name
   *   the rule met.
   */
  constructor(
    readonly reason: AppAttestFailureReason,
    readonly platform: string | null = null,
  ) {
    super(`App Attest verification failed: ${reason}`);
    this.name = "AppAttestVerificationError";
  }
}

/** The pinned root, parsed once. */
const APPLE_ROOT = new X509Certificate(APPLE_APP_ATTESTATION_ROOT_CA_PEM);

/**
 * Input to {@link verifyAttestation}.
 *
 * @property attestationObject - The attestation object as the app received it from `attestKey`.
 * @property keyId - The key id the app sent, decoded from base64 to its 32 bytes.
 * @property clientDataHash - The exact bytes the app passed to `attestKey` as `clientDataHash`.
 * @property policy - The App IDs, environments and build categories accepted.
 * @property now - The moment certificate validity is judged at.
 */
export interface AttestationInput {
  attestationObject: Uint8Array;
  keyId: Buffer;
  clientDataHash: Buffer;
  policy: AppAttestPolicy;
  now: Date;
}

/**
 * What a verified attestation establishes.
 *
 * @property publicKey - The attested key as an uncompressed P-256 point, which assertions are verified against.
 * @property environment - Whether Apple's production or development service attested it.
 * @property platform - The platform the credential certificate names, such as `iphoneos`, or `null`.
 * @property receipt - Apple's receipt, usable later for a fraud-risk query.
 * @property extensions - The build's launch category and bundle version, where the device sent them.
 */
export interface VerifiedAttestation {
  publicKey: Buffer;
  environment: AppAttestEnvironment;
  platform: string | null;
  receipt: Buffer;
  extensions: AppAttestExtensions;
}

/**
 * Verifies an attestation object and returns the key it attests.
 *
 * The steps run in Apple's order. Every refusal throws, so a caller that gets
 * a result back holds a key that a genuine build of an accepted app created on
 * a genuine Apple device, bound to the challenge behind `clientDataHash`.
 *
 * @param input - The object, what the app claims about it, and what is accepted.
 * @returns The attested key and its environment.
 * @throws {AppAttestVerificationError} Naming the first step that failed.
 */
export function verifyAttestation(input: AttestationInput): VerifiedAttestation {
  return translateParseErrors(() => {
    const { authData, credentialCertificate, intermediateCertificate, receipt } = decodeAttestationObject(
      input.attestationObject,
    );

    // Step 1: the chain from the credential certificate through Apple's
    // intermediate to the pinned root.
    const leaf = new X509Certificate(credentialCertificate);
    const intermediate = new X509Certificate(intermediateCertificate);
    verifyCertificateChain(leaf, intermediate, input.now);

    // Steps 2 to 4: the nonce binds the challenge and the authenticator data
    // to the certificate Apple issued for them.
    const nonce = sha256(Buffer.concat([authData, input.clientDataHash]));
    const nonceExtension = readCertificateExtension(credentialCertificate, NONCE_EXTENSION_OID);
    if (!nonceExtension || !readSingleOctetString(nonceExtension).equals(nonce)) {
      throw new AppAttestVerificationError("nonce");
    }
    const platform = verifyAclBlob(credentialCertificate);

    // Step 5: the key id is the hash of the certified public key.
    const publicKey = uncompressedPoint(leaf);
    if (!sha256(publicKey).equals(input.keyId)) throw new AppAttestVerificationError("key_id");

    const authenticatorData = readAttestationAuthenticatorData(authData);
    if (!coseKeyMatches(authenticatorData.coseKey, publicKey)) {
      throw new AppAttestVerificationError("credential_key");
    }

    // Steps 6 to 9: the App ID, a fresh counter, the environment and the credential id.
    verifyRpIdHash(authenticatorData.rpIdHash, input.policy);
    if (authenticatorData.counter !== 0) throw new AppAttestVerificationError("counter");
    const environment = input.policy.environments.find((entry) => entry.aaguid.equals(authenticatorData.aaguid));
    if (!environment) throw new AppAttestVerificationError("environment");
    if (!authenticatorData.credentialId.equals(input.keyId)) throw new AppAttestVerificationError("credential_id");

    // Steps 10 and 11: the build category and the bundle version.
    verifyValidationCategory(authenticatorData.extensions, input.policy);

    return {
      publicKey,
      environment: environment.environment,
      platform,
      receipt,
      extensions: authenticatorData.extensions,
    };
  });
}

/**
 * Input to {@link verifyAssertion}.
 *
 * @property assertionObject - The assertion object as the app received it from `generateAssertion`.
 * @property clientDataHash - SHA-256 of the client data the app signed.
 * @property publicKey - The key stored when the attestation verified, as an uncompressed P-256 point.
 * @property previousCounter - The counter of the last accepted assertion, `0` before the first.
 * @property policy - The App IDs and build categories accepted.
 */
export interface AssertionInput {
  assertionObject: Uint8Array;
  clientDataHash: Buffer;
  publicKey: Buffer;
  previousCounter: number;
  policy: AppAttestPolicy;
}

/**
 * What a verified assertion establishes.
 *
 * @property counter - The assertion's counter, which the caller stores so the next one must exceed it.
 * @property extensions - The build's launch category and bundle version, where the device sent them.
 */
export interface VerifiedAssertion {
  counter: number;
  extensions: AppAttestExtensions;
}

/**
 * Verifies an assertion against a stored key.
 *
 * The client data and its challenge stay with the caller: it computes
 * `clientDataHash` from the client data it expects, so a signature over any
 * other data fails here.
 *
 * @param input - The object, the expected client data hash, and the stored key and counter.
 * @returns The new counter.
 * @throws {AppAttestVerificationError} Naming the first step that failed.
 */
export function verifyAssertion(input: AssertionInput): VerifiedAssertion {
  return translateParseErrors(() => {
    const decoded = decodeCborMap(input.assertionObject);
    const signature = decoded.get("signature");
    const authenticatorDataBytes = decoded.get("authenticatorData");
    if (!(signature instanceof Uint8Array) || !(authenticatorDataBytes instanceof Uint8Array)) {
      throw new AppAttestVerificationError("malformed");
    }

    // Steps 1 to 3: the signature covers the authenticator data and the client data.
    const nonce = sha256(Buffer.concat([authenticatorDataBytes, input.clientDataHash]));
    if (!verifySignature("sha256", nonce, publicKeyFromPoint(input.publicKey), signature)) {
      throw new AppAttestVerificationError("signature");
    }

    // Steps 4 and 5: the App ID and a counter that only ever grows.
    const authenticatorData = readAssertionAuthenticatorData(authenticatorDataBytes);
    verifyRpIdHash(authenticatorData.rpIdHash, input.policy);
    if (authenticatorData.counter <= input.previousCounter) throw new AppAttestVerificationError("counter");

    // Steps 7 and 8: the build category and the bundle version.
    verifyValidationCategory(authenticatorData.extensions, input.policy);

    return { counter: authenticatorData.counter, extensions: authenticatorData.extensions };
  });
}

/**
 * Decodes the attestation object and checks it has the shape Apple specifies.
 *
 * @param attestationObject - The CBOR bytes.
 * @returns Its authenticator data, both certificates and the receipt.
 */
function decodeAttestationObject(attestationObject: Uint8Array): {
  authData: Buffer;
  credentialCertificate: Buffer;
  intermediateCertificate: Buffer;
  receipt: Buffer;
} {
  const decoded = decodeCborMap(attestationObject);
  const statement = decoded.get("attStmt");
  const authData = decoded.get("authData");
  if (decoded.get("fmt") !== ATTESTATION_FORMAT || !(statement instanceof Map) || !(authData instanceof Uint8Array)) {
    throw new AppAttestVerificationError("malformed");
  }

  const certificates = statement.get("x5c");
  const receipt = statement.get("receipt");
  if (
    !Array.isArray(certificates) ||
    certificates.length !== 2 ||
    !certificates.every((certificate) => certificate instanceof Uint8Array) ||
    !(receipt instanceof Uint8Array)
  ) {
    throw new AppAttestVerificationError("malformed");
  }

  return {
    authData: Buffer.from(authData),
    credentialCertificate: Buffer.from(certificates[0] as Uint8Array),
    intermediateCertificate: Buffer.from(certificates[1] as Uint8Array),
    receipt: Buffer.from(receipt),
  };
}

/**
 * Checks that the credential certificate chains to the pinned root through
 * the intermediate, that only the intermediate is a CA, and that all three
 * are valid at `now`.
 */
function verifyCertificateChain(leaf: X509Certificate, intermediate: X509Certificate, now: Date): void {
  const chainHolds =
    !leaf.ca &&
    intermediate.ca &&
    leaf.checkIssued(intermediate) &&
    leaf.verify(intermediate.publicKey) &&
    intermediate.checkIssued(APPLE_ROOT) &&
    intermediate.verify(APPLE_ROOT.publicKey) &&
    [leaf, intermediate, APPLE_ROOT].every((certificate) => isValidAt(certificate, now));
  if (!chainHolds) throw new AppAttestVerificationError("certificate_chain");
}

/**
 * Whether `now` falls inside a certificate's validity window.
 *
 * @param certificate - The certificate.
 * @param now - The moment to judge.
 * @returns `true` from `notBefore` up to and including `notAfter`.
 */
function isValidAt(certificate: X509Certificate, now: Date): boolean {
  const time = now.getTime();
  return Date.parse(certificate.validFrom) <= time && time <= Date.parse(certificate.validTo);
}

/**
 * Reads the platform and the `aclBlob` from the credential certificate and
 * refuses the attestation when {@link aclBlobRuleHolds} says no.
 *
 * @param credentialCertificate - The credential certificate in DER.
 * @returns The platform the certificate names, or `null` when it names none.
 */
function verifyAclBlob(credentialCertificate: Buffer): string | null {
  const operatingSystem = readCertificateExtension(credentialCertificate, OPERATING_SYSTEM_EXTENSION_OID);
  const aclBlobExtension = readCertificateExtension(credentialCertificate, ACL_BLOB_EXTENSION_OID);
  const platform = operatingSystem ? readAttestedPlatform(operatingSystem) : null;
  const aclBlob = aclBlobExtension ? readSingleOctetString(aclBlobExtension) : null;
  if (!aclBlobRuleHolds(platform, aclBlob)) throw new AppAttestVerificationError("acl_blob", platform);
  return platform;
}

/**
 * Apple's macOS rule: the key's `aclBlob` must be the one that stands for
 * System Integrity Protection and full security. An attestation that names
 * itself as iOS is exempt, see {@link IOS_PLATFORM_NAME}; every other one,
 * including one that names no platform, must carry that `aclBlob`. Apple
 * writes the value in base64, and the octet string in its sample holds DER
 * bytes rather than base64 text, so the octet string's bytes are compared with
 * the decoded value.
 *
 * @param platform - The platform the certificate names, or `null`.
 * @param aclBlob - The single octet string of the `aclBlob` extension, or `null` when it is absent.
 * @returns Whether the attestation passes the rule.
 */
export function aclBlobRuleHolds(platform: string | null, aclBlob: Buffer | null): boolean {
  if (platform === IOS_PLATFORM_NAME) return true;
  return aclBlob?.equals(MACOS_REQUIRED_ACL_BLOB) ?? false;
}

/**
 * Checks that the RP ID hash is the SHA-256 of an accepted App ID.
 *
 * @param rpIdHash - The authenticator data's first 32 bytes.
 * @param policy - The accepted App IDs.
 */
function verifyRpIdHash(rpIdHash: Buffer, policy: AppAttestPolicy): void {
  if (!policy.appIds.some((appId) => sha256(Buffer.from(appId, "utf8")).equals(rpIdHash))) {
    throw new AppAttestVerificationError("rp_id");
  }
}

/**
 * Checks the launch category where the device sent one. The bundle version
 * has no value to compare against: the authenticator data reader has already
 * refused one that is not a string, and the caller logs it.
 *
 * @param extensions - The Apple extensions of the authenticator data.
 * @param policy - The accepted categories.
 */
function verifyValidationCategory(extensions: AppAttestExtensions, policy: AppAttestPolicy): void {
  const category = extensions.validationCategory;
  if (category !== undefined && !policy.validationCategories.includes(category)) {
    throw new AppAttestVerificationError("validation_category");
  }
}

/**
 * The certified public key as an uncompressed point, which is the form Apple
 * hashes into the key id.
 *
 * @param certificate - The credential certificate.
 * @returns `04 || x || y`.
 */
function uncompressedPoint(certificate: X509Certificate): Buffer {
  const key = certificate.publicKey;
  if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new AppAttestVerificationError("key_id");
  const jwk = key.export({ format: "jwk" });
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") throw new AppAttestVerificationError("key_id");
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
}

/**
 * Whether the COSE key in the authenticator data is the certified key. Apple's
 * steps do not list this, and it costs nothing: two different keys in one
 * attestation would mean it was assembled rather than issued.
 *
 * @param coseKey - The decoded COSE key.
 * @param publicKey - The certified key as an uncompressed point.
 */
function coseKeyMatches(coseKey: Map<string | number, CBORType>, publicKey: Buffer): boolean {
  const x = coseKey.get(COSE_X);
  const y = coseKey.get(COSE_Y);
  return (
    coseKey.get(COSE_KEY_TYPE) === COSE_KEY_TYPE_EC2 &&
    coseKey.get(COSE_ALGORITHM) === COSE_ALGORITHM_ES256 &&
    coseKey.get(COSE_CURVE) === COSE_CURVE_P256 &&
    x instanceof Uint8Array &&
    y instanceof Uint8Array &&
    Buffer.concat([Buffer.from([0x04]), x, y]).equals(publicKey)
  );
}

/**
 * Turns a stored uncompressed point into a key `crypto.verify` accepts.
 *
 * @param point - `04 || x || y`.
 * @returns The public key.
 */
function publicKeyFromPoint(point: Buffer) {
  if (point.length !== UNCOMPRESSED_P256_POINT_LENGTH || point[0] !== 0x04) {
    throw new AppAttestVerificationError("malformed");
  }
  return createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33).toString("base64url"),
    },
    format: "jwk",
  });
}

/**
 * Decodes bytes that must hold exactly one CBOR map.
 *
 * @param bytes - The CBOR encoding.
 * @returns The map.
 */
function decodeCborMap(bytes: Uint8Array): Map<string | number, CBORType> {
  let decoded: CBORType;
  try {
    decoded = decodeCBOR(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    throw new AppAttestVerificationError("malformed");
  }
  if (!(decoded instanceof Map)) throw new AppAttestVerificationError("malformed");
  return decoded;
}

/**
 * Runs a verification and reports any other failure as `malformed`, so every
 * refusal leaves as an {@link AppAttestVerificationError}. The authenticator
 * data and certificate readers throw their own errors on bad structure, and
 * Node throws a plain `Error` for a certificate or key it cannot parse.
 *
 * @param verification - The steps to run.
 * @returns What the steps return.
 */
function translateParseErrors<T>(verification: () => T): T {
  try {
    return verification();
  } catch (error) {
    if (error instanceof AppAttestVerificationError) throw error;
    throw new AppAttestVerificationError("malformed");
  }
}

/**
 * SHA-256 of some bytes.
 *
 * @param data - The bytes.
 * @returns The 32-byte digest.
 */
function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

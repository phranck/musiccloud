/**
 * @file The Apple app's way in: attest a key, renew a session with an
 * assertion, and recognise a session on a later request.
 *
 * The app signs the same client data in both flows: the challenge exactly as
 * the backend sent it, as UTF-8 text. So `clientDataHash` is the SHA-256 of
 * those bytes, which is what Apple's steps describe for an attestation and
 * what binds an assertion to its one-time challenge.
 */
import { createHash } from "node:crypto";
import { buildAppAttestPolicy } from "./policy.js";
import { type AppSession, issueAppSessionToken, verifyAppSessionToken } from "./session-token.js";
import {
  advanceAttestedKeyCounter,
  consumeAppAttestChallenge,
  findActiveAttestedKey,
  isAttestedKeyActive,
  storeAttestedKey,
} from "./store.js";
import {
  type AppAttestFailureReason,
  AppAttestVerificationError,
  verifyAssertion,
  verifyAttestation,
} from "./verify.js";

/** Why a request did not get a session, each answered with its own error code. */
export type AppAccessRefusal =
  /** The challenge is unknown, expired or used. */
  | "challenge"
  /** An Apple verification step failed, named in `reason`. */
  | "verification"
  /** The key is not stored or is revoked. */
  | "unknown_key"
  /** The key is stored already, so it cannot be attested again. */
  | "already_attested";

/** The outcome of an attestation or a renewal. */
export type AppAccessResult =
  | { session: AppSession; details: AppAccessDetails }
  | { refusal: AppAccessRefusal; reason?: AppAttestFailureReason; details?: AppAccessDetails };

/**
 * What a log line may say about a verified request. None of it is secret,
 * and none of it identifies a person.
 *
 * @property environment - The App Attest environment of the key.
 * @property platform - The platform the credential certificate names, on an
 *   attestation and on a refusal by the `aclBlob` rule.
 * @property validationCategory - The launch category Apple reported, where it did.
 * @property bundleVersion - The bundle version Apple reported, where it did.
 * @property counter - The assertion counter, on renewal.
 */
export interface AppAccessDetails {
  environment?: string;
  platform?: string | null;
  validationCategory?: number;
  bundleVersion?: string;
  counter?: number;
}

/** An attestation as the app sends it. */
export interface AppAttestRequest {
  keyId: string;
  attestation: string;
  challenge: string;
}

/** An assertion as the app sends it. */
export interface AppSessionRequest {
  keyId: string;
  assertion: string;
  challenge: string;
}

/**
 * The client data hash both flows sign.
 *
 * @param challenge - The challenge as the backend issued it.
 * @returns SHA-256 of its UTF-8 bytes.
 */
export function appAttestClientDataHash(challenge: string): Buffer {
  return createHash("sha256").update(challenge, "utf8").digest();
}

/**
 * Attests a new key and issues its first session.
 *
 * The challenge is consumed before anything is verified, so a refused
 * attestation cannot be retried with the same challenge.
 *
 * @param request - The key id, the attestation object and the challenge, as the schema admitted them.
 * @param now - The moment of the request.
 * @returns A session, or why there is none.
 */
export async function attestAppKey(request: AppAttestRequest, now: Date): Promise<AppAccessResult> {
  if (!(await consumeAppAttestChallenge(request.challenge, now))) return { refusal: "challenge" };

  let verified: ReturnType<typeof verifyAttestation>;
  try {
    verified = verifyAttestation({
      attestationObject: Buffer.from(request.attestation, "base64"),
      keyId: Buffer.from(request.keyId, "base64"),
      clientDataHash: appAttestClientDataHash(request.challenge),
      policy: buildAppAttestPolicy(process.env.NODE_ENV),
      now,
    });
  } catch (error) {
    if (!(error instanceof AppAttestVerificationError)) throw error;
    return { refusal: "verification", reason: error.reason, details: { platform: error.platform } };
  }

  const details: AppAccessDetails = {
    environment: verified.environment,
    platform: verified.platform,
    validationCategory: verified.extensions.validationCategory,
    bundleVersion: verified.extensions.bundleVersion,
  };
  const stored = await storeAttestedKey(
    { keyId: request.keyId, publicKey: verified.publicKey, environment: verified.environment },
    now,
  );
  if (!stored) return { refusal: "already_attested", details };

  return { session: await issueAppSessionToken(request.keyId, now), details };
}

/**
 * Renews a session with an assertion over a fresh challenge.
 *
 * @param request - The key id, the assertion object and the challenge, as the schema admitted them.
 * @param now - The moment of the request.
 * @returns A session, or why there is none.
 */
export async function renewAppSession(request: AppSessionRequest, now: Date): Promise<AppAccessResult> {
  if (!(await consumeAppAttestChallenge(request.challenge, now))) return { refusal: "challenge" };

  const key = await findActiveAttestedKey(request.keyId);
  const policy = buildAppAttestPolicy(process.env.NODE_ENV);
  // A key from an environment this process no longer accepts counts as unknown,
  // so a development key cannot outlive a switch of the same database to production.
  if (!key || !policy.environments.some((entry) => entry.environment === key.environment)) {
    return { refusal: "unknown_key" };
  }

  let counter: number;
  let details: AppAccessDetails;
  try {
    const verified = verifyAssertion({
      assertionObject: Buffer.from(request.assertion, "base64"),
      clientDataHash: appAttestClientDataHash(request.challenge),
      publicKey: key.publicKey,
      previousCounter: key.signCount,
      policy,
    });
    counter = verified.counter;
    details = {
      environment: key.environment,
      counter,
      validationCategory: verified.extensions.validationCategory,
      bundleVersion: verified.extensions.bundleVersion,
    };
  } catch (error) {
    if (!(error instanceof AppAttestVerificationError)) throw error;
    return { refusal: "verification", reason: error.reason };
  }

  // A concurrent assertion may have moved the counter past this one in the
  // meantime, which makes this one a replay.
  if (!(await advanceAttestedKeyCounter(request.keyId, counter, now))) {
    return { refusal: "verification", reason: "counter", details };
  }

  return { session: await issueAppSessionToken(request.keyId, now), details };
}

/**
 * Recognises a session token on a request.
 *
 * @param token - The bearer token.
 * @param now - The moment expiry is judged at.
 * @returns The key id the session belongs to, or `null` when the token does
 *   not verify or its key is unknown or revoked.
 * @throws {AppSessionUnconfiguredError} When `APP_SESSION_SECRET` is unusable.
 */
export async function resolveAppSessionKey(token: string, now: Date): Promise<string | null> {
  const keyId = await verifyAppSessionToken(token, now);
  if (!keyId) return null;
  return (await isAttestedKeyActive(keyId)) ? keyId : null;
}

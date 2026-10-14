/**
 * @file Session tokens for the Apple app, issued once App Attest has proven a
 * request comes from a genuine build.
 *
 * A token is an HS256 JWT signed with `APP_SESSION_SECRET`, a secret no other
 * token kind uses, so neither an admin token nor a developer session can pass
 * as one, and the reverse holds as well. Its audience names the Apple app, its
 * subject is the attested key id, and it lives for
 * {@link APP_SESSION_LIFETIME_SECONDS}.
 */
import { jwtVerify, SignJWT } from "jose";

/** The audience every app session token carries and every verification demands. */
export const APP_SESSION_AUDIENCE = "musiccloud-apple-app";

/**
 * How long a session token is valid. The app renews it with an assertion,
 * which costs a challenge and a signature, so a week keeps renewals rare
 * while a revoked key still loses access through the revocation check.
 */
export const APP_SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/** The shortest `APP_SESSION_SECRET` accepted, in bytes: the 256 bits an HS256 key should have. */
export const APP_SESSION_SECRET_MIN_BYTES = 32;

/** The only algorithm a session token may be signed with. */
const APP_SESSION_ALGORITHM = "HS256";

/** The environment variable holding the signing secret. */
export const APP_SESSION_SECRET_VARIABLE = "APP_SESSION_SECRET";

/** `APP_SESSION_SECRET` is missing or too short, so no session can be issued or verified. */
export class AppSessionUnconfiguredError extends Error {
  constructor() {
    super(`${APP_SESSION_SECRET_VARIABLE} is not set or shorter than ${APP_SESSION_SECRET_MIN_BYTES} bytes.`);
    this.name = "AppSessionUnconfiguredError";
  }
}

/**
 * Checks the signing secret the way the boot does.
 *
 * Production requires it. Elsewhere it may be absent, which leaves the app
 * routes refusing every request, but a value that is present must have the
 * same length as in production, so a weak local secret cannot be mistaken
 * for a working setup.
 *
 * @param nodeEnv - The process's `NODE_ENV`.
 * @param secret - The value of `APP_SESSION_SECRET`.
 * @throws {AppSessionUnconfiguredError} When production has no usable secret,
 *   or any environment has one that is too short.
 */
export function assertAppSessionSecret(nodeEnv: string | undefined, secret: string | undefined): void {
  if (!secret && nodeEnv !== "production") return;
  if (!isUsableSecret(secret)) throw new AppSessionUnconfiguredError();
}

/**
 * Whether a value may sign session tokens.
 *
 * @param secret - The value of `APP_SESSION_SECRET`.
 * @returns `true` when it is at least {@link APP_SESSION_SECRET_MIN_BYTES} bytes long in UTF-8.
 */
function isUsableSecret(secret: string | undefined): secret is string {
  return secret !== undefined && Buffer.byteLength(secret, "utf8") >= APP_SESSION_SECRET_MIN_BYTES;
}

/**
 * The signing key, read on every call so a test can set the variable.
 *
 * @returns The secret's bytes.
 * @throws {AppSessionUnconfiguredError} When the secret is missing or too short.
 */
function signingKey(): Uint8Array {
  const secret = process.env[APP_SESSION_SECRET_VARIABLE];
  if (!isUsableSecret(secret)) throw new AppSessionUnconfiguredError();
  return new TextEncoder().encode(secret);
}

/** An issued session token and the moment it stops being valid. */
export interface AppSession {
  token: string;
  expiresAt: Date;
}

/**
 * Issues a session token for an attested key.
 *
 * @param keyId - The key id in the base64 form the app sends it, which becomes the subject.
 * @param now - The issue time; the token expires {@link APP_SESSION_LIFETIME_SECONDS} later.
 * @returns The token and its expiry.
 * @throws {AppSessionUnconfiguredError} When the secret is missing or too short.
 */
export async function issueAppSessionToken(keyId: string, now: Date): Promise<AppSession> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + APP_SESSION_LIFETIME_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: APP_SESSION_ALGORITHM, typ: "JWT" })
    .setAudience(APP_SESSION_AUDIENCE)
    .setSubject(keyId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(signingKey());
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

/**
 * Verifies a session token and returns the key it was issued to.
 *
 * The signature, the algorithm, the audience and the expiry are all checked.
 * Whether the key has been revoked since is the caller's question, because it
 * lives in the database.
 *
 * @param token - The bearer token from the request.
 * @param now - The moment expiry is judged at.
 * @returns The key id, or `null` for any token that does not verify.
 * @throws {AppSessionUnconfiguredError} When the secret is missing or too short,
 *   so a missing configuration refuses rather than lets a request through.
 */
export async function verifyAppSessionToken(token: string, now: Date = new Date()): Promise<string | null> {
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [APP_SESSION_ALGORITHM],
      audience: APP_SESSION_AUDIENCE,
      currentDate: now,
      requiredClaims: ["sub", "exp", "iat"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

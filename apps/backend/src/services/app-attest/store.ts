/**
 * @file The App Attest rows: one-time challenges and attested keys.
 *
 * Every write is a single conditional statement, so two requests racing for
 * the same challenge or the same counter cannot both win.
 */
import { randomBytes } from "node:crypto";
import { getDatabasePool } from "../../db/pool.js";
import type { AppAttestEnvironment } from "./policy.js";

/** How long a challenge may be used after it was issued. */
export const APP_ATTEST_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Random bytes in a challenge. 256 bits from the operating system's CSPRNG:
 * at a million challenges alive at once the chance of two being equal is
 * about 2^-216, and guessing one is out of reach, so the unique key only
 * ever fails in theory. Encoded as base64url this is 43 characters.
 */
const CHALLENGE_BYTES = 32;

/** How often an insert is retried with a fresh value after a unique violation. */
const CHALLENGE_INSERT_ATTEMPTS = 3;

/** PostgreSQL's SQLSTATE for a unique violation. */
const UNIQUE_VIOLATION = "23505";

/** A challenge as handed to the app. */
export interface IssuedChallenge {
  challenge: string;
  expiresAt: Date;
}

/** An attested key that is not revoked. */
export interface StoredAppAttestKey {
  publicKey: Buffer;
  signCount: number;
  environment: AppAttestEnvironment;
}

/**
 * Whether a database error is a unique violation.
 *
 * @param error - What the driver threw.
 * @returns `true` for SQLSTATE 23505.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * Issues a new one-time challenge and removes the expired ones.
 *
 * The expired rows go first, in the same call, which keeps the table at the
 * size of the last few minutes of traffic without a separate job.
 *
 * @param now - The issue time; the challenge expires {@link APP_ATTEST_CHALLENGE_TTL_MS} later.
 * @returns The stored challenge and its expiry.
 * @throws The last unique violation when every attempt collided, which does not happen in practice.
 */
export async function issueAppAttestChallenge(now: Date): Promise<IssuedChallenge> {
  const pool = getDatabasePool();
  await pool.query("DELETE FROM app_attest_challenges WHERE expires_at <= $1", [now]);

  const expiresAt = new Date(now.getTime() + APP_ATTEST_CHALLENGE_TTL_MS);
  let lastError: unknown;
  for (let attempt = 0; attempt < CHALLENGE_INSERT_ATTEMPTS; attempt += 1) {
    const challenge = randomBytes(CHALLENGE_BYTES).toString("base64url");
    try {
      const inserted = await pool.query<{ challenge: string; expires_at: Date }>(
        `INSERT INTO app_attest_challenges (challenge, created_at, expires_at)
         VALUES ($1, $2, $3)
         RETURNING challenge, expires_at`,
        [challenge, now, expiresAt],
      );
      const row = inserted.rows[0] as { challenge: string; expires_at: Date };
      return { challenge: row.challenge, expiresAt: row.expires_at };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Consumes a challenge, so it can never be used again.
 *
 * The row is deleted whether or not it is still valid, and only a row that had
 * not expired counts as consumed.
 *
 * @param challenge - The challenge the app sent back.
 * @param now - The moment expiry is judged at.
 * @returns `true` when the challenge existed, was unused and had not expired.
 */
export async function consumeAppAttestChallenge(challenge: string, now: Date): Promise<boolean> {
  const deleted = await getDatabasePool().query<{ expires_at: Date }>(
    "DELETE FROM app_attest_challenges WHERE challenge = $1 RETURNING expires_at",
    [challenge],
  );
  const row = deleted.rows[0];
  return row !== undefined && row.expires_at.getTime() > now.getTime();
}

/**
 * Stores a freshly attested key with counter 0.
 *
 * Apple asks that a public key belong to one installation only, so a key id
 * that is already stored is not overwritten.
 *
 * @param key - The key id, the key as an uncompressed point, and its environment.
 * @param now - The moment it was attested, which is also its first use.
 * @returns `true` when the key was stored, `false` when it was stored already.
 */
export async function storeAttestedKey(
  key: { keyId: string; publicKey: Buffer; environment: AppAttestEnvironment },
  now: Date,
): Promise<boolean> {
  try {
    await getDatabasePool().query(
      `INSERT INTO app_attest_keys (key_id, public_key, sign_count, environment, created_at, last_used_at)
       VALUES ($1, $2, 0, $3, $4, $4)`,
      [key.keyId, key.publicKey, key.environment, now],
    );
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Loads a key that has not been revoked.
 *
 * @param keyId - The key id the request names.
 * @returns The key, or `null` when it is unknown or revoked.
 */
export async function findActiveAttestedKey(keyId: string): Promise<StoredAppAttestKey | null> {
  const result = await getDatabasePool().query<{
    public_key: Buffer;
    sign_count: string;
    environment: AppAttestEnvironment;
  }>("SELECT public_key, sign_count, environment FROM app_attest_keys WHERE key_id = $1 AND revoked_at IS NULL", [
    keyId,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  // node-postgres returns `bigint` as a string; the column is bounded to 32 bits.
  return { publicKey: row.public_key, signCount: Number(row.sign_count), environment: row.environment };
}

/**
 * Whether a key is stored and not revoked, which is what a session token
 * needs beyond its signature.
 *
 * @param keyId - The token's subject.
 * @returns `true` for a known key without `revoked_at`.
 */
export async function isAttestedKeyActive(keyId: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    "SELECT 1 FROM app_attest_keys WHERE key_id = $1 AND revoked_at IS NULL",
    [keyId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Records an accepted assertion's counter.
 *
 * The update only applies while the stored counter is lower, so of two
 * assertions verified at the same time only one can move it.
 *
 * @param keyId - The key that signed the assertion.
 * @param counter - The assertion's counter.
 * @param now - The moment of use.
 * @returns `true` when this call moved the counter.
 */
export async function advanceAttestedKeyCounter(keyId: string, counter: number, now: Date): Promise<boolean> {
  const result = await getDatabasePool().query(
    `UPDATE app_attest_keys SET sign_count = $2, last_used_at = $3
     WHERE key_id = $1 AND revoked_at IS NULL AND sign_count < $2`,
    [keyId, counter, now],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Deletes the keys not used since `cutoff`: renewed last before it, or,
 * when never renewed, attested before it. An installation whose key is
 * gone attests a new one on its next request, so nothing breaks for it.
 *
 * @param cutoff - Keys whose last use is older than this are removed.
 * @returns How many keys were removed.
 */
export async function deleteAttestedKeysUnusedSince(cutoff: Date): Promise<number> {
  const result = await getDatabasePool().query(
    "DELETE FROM app_attest_keys WHERE COALESCE(last_used_at, created_at) < $1",
    [cutoff],
  );
  return result.rowCount ?? 0;
}

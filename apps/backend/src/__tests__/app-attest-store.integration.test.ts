import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import {
  advanceAttestedKeyCounter,
  consumeAppAttestChallenge,
  findActiveAttestedKey,
  isAttestedKeyActive,
  issueAppAttestChallenge,
  storeAttestedKey,
} from "../services/app-attest/store.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/**
 * Runs the App Attest SQL against the Postgres `TEST_DATABASE_URL` names.
 *
 * Every row is created here and removed here. Challenges are issued at a
 * moment in the year 2000, so the clean-up of expired challenges that issuing
 * performs cannot reach a row anybody else wrote.
 */
describe.skipIf(!integrationDatabaseUrl())("App Attest store (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const PAST = new Date("2000-01-01T00:00:00Z");
  const keyIds: string[] = [];
  const challenges: string[] = [];
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM app_attest_keys WHERE key_id = ANY($1::text[])", [keyIds]);
    await client.query("DELETE FROM app_attest_challenges WHERE challenge = ANY($1::text[])", [challenges]);
    await client.end();
    await closeDatabasePool();
  });

  function freshKeyId(): string {
    const keyId = randomBytes(32).toString("base64");
    keyIds.push(keyId);
    return keyId;
  }

  it("issues a challenge that can be consumed once", async () => {
    const issued = await issueAppAttestChallenge(PAST);
    challenges.push(issued.challenge);

    expect(issued.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime() - PAST.getTime()).toBe(5 * 60 * 1000);
    expect(await consumeAppAttestChallenge(issued.challenge, new Date(PAST.getTime() + 1000))).toBe(true);
    expect(await consumeAppAttestChallenge(issued.challenge, new Date(PAST.getTime() + 2000))).toBe(false);
  });

  it("refuses an expired challenge and removes it all the same", async () => {
    const issued = await issueAppAttestChallenge(PAST);
    challenges.push(issued.challenge);

    expect(await consumeAppAttestChallenge(issued.challenge, new Date(PAST.getTime() + 6 * 60 * 1000))).toBe(false);
    const left = await client.query("SELECT 1 FROM app_attest_challenges WHERE challenge = $1", [issued.challenge]);
    expect(left.rowCount).toBe(0);
  });

  it("stores a key once, with counter 0, and moves the counter only upwards", async () => {
    const keyId = freshKeyId();
    const publicKey = Buffer.concat([Buffer.from([0x04]), randomBytes(64)]);

    expect(await storeAttestedKey({ keyId, publicKey, environment: "development" }, PAST)).toBe(true);
    expect(await storeAttestedKey({ keyId, publicKey, environment: "development" }, PAST)).toBe(false);
    expect(await findActiveAttestedKey(keyId)).toEqual({ publicKey, signCount: 0, environment: "development" });

    expect(await advanceAttestedKeyCounter(keyId, 5, PAST)).toBe(true);
    expect(await advanceAttestedKeyCounter(keyId, 5, PAST)).toBe(false);
    expect(await advanceAttestedKeyCounter(keyId, 4, PAST)).toBe(false);
    expect(await advanceAttestedKeyCounter(keyId, 4_294_967_295, PAST)).toBe(true);
    expect((await findActiveAttestedKey(keyId))?.signCount).toBe(4_294_967_295);
  });

  it("treats a revoked key as unknown", async () => {
    const keyId = freshKeyId();
    const publicKey = Buffer.concat([Buffer.from([0x04]), randomBytes(64)]);
    await storeAttestedKey({ keyId, publicKey, environment: "production" }, PAST);
    expect(await isAttestedKeyActive(keyId)).toBe(true);

    await client.query("UPDATE app_attest_keys SET revoked_at = now() WHERE key_id = $1", [keyId]);

    expect(await isAttestedKeyActive(keyId)).toBe(false);
    expect(await findActiveAttestedKey(keyId)).toBeNull();
    expect(await advanceAttestedKeyCounter(keyId, 1, PAST)).toBe(false);
  });
});

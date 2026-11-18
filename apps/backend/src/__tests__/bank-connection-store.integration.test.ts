import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import {
  getLiveBankConnection,
  insertAuthorizationState,
  replaceBankConnection,
  revokeLiveBankConnection,
  setConsentNoticeStage,
  takeAuthorizationState,
} from "../services/bank-connection-store.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/** PostgreSQL's SQLSTATE for a unique violation. */
const PG_UNIQUE_VIOLATION = "23505";

/** PostgreSQL's SQLSTATE for a check constraint violation. */
const PG_CHECK_VIOLATION = "23514";

/** How long an authorization of the run stands: ten minutes. */
const AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Runs the bank connection's SQL against the Postgres `TEST_DATABASE_URL`
 * names.
 *
 * Replacing and revoking act on whatever connection is live, and starting an
 * authorization sweeps every expired one, because that is what they are for.
 * So the suite runs only against tables that hold no row it did not create: it
 * looks once before the first case and skips every case where either table
 * already holds something. Every connection and authorization of the run is
 * collected and removed by its own key afterwards.
 */
describe.skipIf(!integrationDatabaseUrl())("bank connection store (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-bank-${Date.now()}`;
  const createdConnectionIds: string[] = [];
  const createdStates: string[] = [];
  let client: pg.Client;
  let holdsForeignRows = true;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    const counts = await client.query<{ connections: string; states: string }>(
      `SELECT (SELECT count(*) FROM bank_connections) AS connections,
              (SELECT count(*) FROM bank_authorization_states) AS states`,
    );
    const row = counts.rows[0];
    holdsForeignRows = Number(row?.connections) > 0 || Number(row?.states) > 0;
  });

  afterAll(async () => {
    await client.query("DELETE FROM bank_connections WHERE id = ANY($1::text[])", [createdConnectionIds]);
    await client.query("DELETE FROM bank_authorization_states WHERE state = ANY($1::text[])", [createdStates]);
    await client.end();
    await closeDatabasePool();
  });

  /**
   * A state of the run, 64 hex characters unique to it.
   *
   * @param digit - The hex digit that tells this case's state apart.
   */
  function stateOf(digit: string): string {
    const state = `${Date.now().toString(16)}${digit}`.padEnd(64, digit).slice(0, 64);
    createdStates.push(state);
    return state;
  }

  /**
   * Puts a connection of the run in force and remembers it for the clean-up.
   *
   * @param sessionId - Tells this connection apart.
   */
  async function connect(sessionId: string) {
    const stored = await replaceBankConnection(
      {
        sessionId: `${MARKER}-${sessionId}`,
        accountUid: `${MARKER}-account`,
        aspspName: "Erste Bank",
        aspspCountry: "AT",
        consentValidUntil: new Date("2027-03-02T00:00:00.000Z"),
      },
      new Date(),
    );
    createdConnectionIds.push(stored.id);
    return stored;
  }

  it("spends a started authorization once, and finds nothing the second time", async ({ skip }) => {
    if (holdsForeignRows) skip();
    const now = new Date();
    const state = stateOf("a");

    const stored = await insertAuthorizationState(
      state,
      "auth-1",
      new Date(now.getTime() + AUTHORIZATION_LIFETIME_MS),
      now,
    );
    expect(stored).toMatchObject({ state, authorizationId: "auth-1" });

    expect(await takeAuthorizationState(state, now)).toMatchObject({ state, authorizationId: "auth-1" });
    expect(await takeAuthorizationState(state, now)).toBeNull();
  });

  it("does not honor an authorization that has expired, and sweeps it when the next one starts", async ({ skip }) => {
    if (holdsForeignRows) skip();
    const now = new Date();
    const expired = stateOf("b");
    await insertAuthorizationState(
      expired,
      "",
      new Date(now.getTime() - 1),
      new Date(now.getTime() - AUTHORIZATION_LIFETIME_MS),
    );

    expect(await takeAuthorizationState(expired, now)).toBeNull();

    await insertAuthorizationState(stateOf("c"), "", new Date(now.getTime() + AUTHORIZATION_LIFETIME_MS), now);
    const left = await client.query("SELECT 1 FROM bank_authorization_states WHERE state = $1", [expired]);
    expect(left.rowCount).toBe(0);
  });

  it("keeps one connection live, retiring the one it replaces rather than deleting it", async ({ skip }) => {
    if (holdsForeignRows) skip();
    const first = await connect("first");
    const second = await connect("second");

    expect((await getLiveBankConnection())?.id).toBe(second.id);
    const retired = await client.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM bank_connections WHERE id = $1",
      [first.id],
    );
    expect(retired.rows[0]?.revoked_at).not.toBeNull();
  });

  it("refuses a second live connection at the database, whatever the service does", async ({ skip }) => {
    if (holdsForeignRows) skip();
    await connect("live");
    const id = `${MARKER}-direct`;
    createdConnectionIds.push(id);

    await expect(
      client.query("INSERT INTO bank_connections (id, session_id, account_uid) VALUES ($1, $2, $3)", [id, id, id]),
    ).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });
  });

  it("records the furthest warning sent, and refuses one that is not a stage", async ({ skip }) => {
    if (holdsForeignRows) skip();
    const live = await connect("warned");

    await setConsentNoticeStage(live.id, "imminent");
    expect((await getLiveBankConnection())?.consentNoticeStage).toBe("imminent");

    await expect(
      client.query("UPDATE bank_connections SET consent_notice_stage = 'later' WHERE id = $1", [live.id]),
    ).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
  });

  it("withdraws the live connection once, handing back the session it held", async ({ skip }) => {
    if (holdsForeignRows) skip();
    const live = await connect("withdrawn");

    const revoked = await revokeLiveBankConnection(new Date());

    expect(revoked).toMatchObject({ id: live.id, sessionId: live.sessionId });
    expect(revoked?.revokedAt).not.toBeNull();
    expect(await getLiveBankConnection()).toBeNull();
    expect(await revokeLiveBankConnection(new Date())).toBeNull();
  });
});

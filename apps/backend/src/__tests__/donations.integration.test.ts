import { DonationProvider, type DonationProviderValue } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import {
  createDonation,
  deleteDonation,
  listDonations,
  readDonationTotals,
  updateDonation,
} from "../services/donations.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/**
 * Runs the donations ledger SQL against the Postgres `TEST_DATABASE_URL` names.
 *
 * Every row is created here, named with a marker, and removed here. The rows
 * fall in 2001 and the sums are read with 2001-06-15 as today, so no row any
 * other test writes can reach a window this test measures.
 */
describe.skipIf(!integrationDatabaseUrl())("donations ledger (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-donations-${Date.now()}`;
  const TODAY = "2001-06-15";
  const ids: string[] = [];
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM donations WHERE id = ANY($1::text[])", [ids]);
    await client.end();
    await closeDatabasePool();
  });

  async function record(
    amountCents: number,
    receivedOn: string,
    provider: DonationProviderValue = DonationProvider.Paypal,
  ) {
    const donation = await createDonation({
      name: MARKER,
      published: false,
      amountCents,
      receivedOn,
      provider,
      note: "",
    });
    ids.push(donation.id);
    return donation;
  }

  it("stores a donation and reads its day back unchanged", async () => {
    const donation = await record(2_000, "2001-06-15");

    expect(donation.receivedOn).toBe("2001-06-15");
    expect((await listDonations()).some((row) => row.id === donation.id)).toBe(true);
  });

  it("sums the rolling year and month, including today and the window's first day", async () => {
    await record(1_000, "2000-06-16", DonationProvider.BankTransfer); // first day of the year window
    await record(500, "2000-06-15"); // one day before it
    await record(300, "2001-05-17", DonationProvider.GithubSponsors); // first day of the month window
    await record(700, "2001-06-16"); // tomorrow

    const totals = await readDonationTotals(TODAY);

    // 2,000 (today, first test) + 1,000 + 300; neither the day before the window nor tomorrow.
    expect(totals.donatedYearCents).toBe(3_300);
    expect(totals.donatedMonthCents).toBe(2_300);
    expect(totals.byProvider).toEqual({
      [DonationProvider.Paypal]: 2_000,
      [DonationProvider.BankTransfer]: 1_000,
      [DonationProvider.GithubSponsors]: 300,
    });
    expect(totals.byMonth).toHaveLength(13);
    expect(totals.byMonth[0]?.month).toBe("2000-06");
    expect(totals.byMonth.at(-1)).toEqual({ month: "2001-06", byProvider: { [DonationProvider.Paypal]: 2_000 } });
  });

  it("changes and removes a donation", async () => {
    const donation = await record(100, "2001-01-01");

    const input = {
      name: MARKER,
      published: true,
      amountCents: 150,
      receivedOn: "2001-01-02",
      provider: DonationProvider.Other,
      note: "cash",
    };
    const changed = await updateDonation(donation.id, input);
    expect(changed).toMatchObject({ amountCents: 150, receivedOn: "2001-01-02", provider: "other", note: "cash" });

    expect(await deleteDonation(donation.id)).toBe(true);
    expect(await deleteDonation(donation.id)).toBe(false);
    expect(await updateDonation(donation.id, input)).toBeNull();
  });

  it("refuses a provider or an amount the ledger does not hold", async () => {
    await expect(
      client.query(
        "INSERT INTO donations (id, name, amount_cents, received_on, provider) VALUES ($1, $2, 100, '2001-01-01', 'crypto')",
        [`${MARKER}-bad-provider`, MARKER],
      ),
    ).rejects.toThrow(/chk_donations_provider/);
    await expect(
      client.query(
        "INSERT INTO donations (id, name, amount_cents, received_on, provider) VALUES ($1, $2, 0, '2001-01-01', 'paypal')",
        [`${MARKER}-zero`, MARKER],
      ),
    ).rejects.toThrow(/chk_donations_amount/);
  });
});

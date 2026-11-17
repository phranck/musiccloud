import { DonationProvider, type SponsorInput } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import { createDonation, listDonations } from "../services/donations.js";
import { createSponsor, deleteSponsor, listSponsors, sponsorExists, updateSponsor } from "../services/sponsors.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/**
 * Runs the annual sponsors' SQL against the Postgres `TEST_DATABASE_URL` names.
 *
 * Every sponsor and donation is created here, named with a marker, and removed
 * here, donations first, because a removed sponsor leaves its donations behind.
 */
describe.skipIf(!integrationDatabaseUrl())("annual sponsors (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-sponsors-${Date.now()}`;
  const sponsorIds: string[] = [];
  const donationIds: string[] = [];
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM donations WHERE id = ANY($1::text[])", [donationIds]);
    await client.query("DELETE FROM sponsors WHERE id = ANY($1::text[])", [sponsorIds]);
    await client.end();
    await closeDatabasePool();
  });

  /** A sponsor of the run, with two addresses in a fixed order. */
  const input: SponsorInput = {
    name: MARKER,
    links: ["https://chaos.social/@ada", "https://ada.example"],
    claim: "",
    published: true,
    paidOn: "2001-03-01",
  };

  async function sponsor(change: Partial<SponsorInput> = {}) {
    const created = await createSponsor({ ...input, ...change });
    sponsorIds.push(created.id);
    return created;
  }

  async function donate(amountCents: number, sponsorId: string | null) {
    const donation = await createDonation({
      name: MARKER,
      published: false,
      amountCents,
      receivedOn: "2001-03-01",
      provider: DonationProvider.BankTransfer,
      note: "",
      sponsorId,
    });
    donationIds.push(donation.id);
    return donation;
  }

  it("stores a sponsor and reads the day and the addresses back unchanged", async () => {
    const created = await sponsor();

    expect(created).toMatchObject({ paidOn: "2001-03-01", links: input.links, amountCents: 0 });
    expect(await sponsorExists(created.id)).toBe(true);
  });

  it("sums only the donations linked to a sponsor", async () => {
    const created = await sponsor();
    await donate(4_000, created.id);
    await donate(1_000, created.id);
    await donate(700, null);

    const listed = (await listSponsors()).find((row) => row.id === created.id);
    expect(listed?.amountCents).toBe(5_000);

    const changed = await updateSponsor(created.id, { ...input, claim: "Still here." });
    expect(changed).toMatchObject({ claim: "Still here.", amountCents: 5_000 });
  });

  it("keeps the donations as free ones when the sponsor is removed", async () => {
    const created = await sponsor();
    const donation = await donate(2_500, created.id);

    expect(await deleteSponsor(created.id)).toBe(true);
    expect(await deleteSponsor(created.id)).toBe(false);
    expect(await updateSponsor(created.id, input)).toBeNull();

    const kept = (await listDonations()).find((row) => row.id === donation.id);
    expect(kept).toMatchObject({ amountCents: 2_500, sponsorId: null });
  });

  it("refuses a donation linked to a sponsor that does not exist", async () => {
    await expect(
      client.query(
        "INSERT INTO donations (id, name, amount_cents, received_on, provider, sponsor_id) VALUES ($1, $2, 100, '2001-01-01', 'paypal', $3)",
        [`${MARKER}-orphan`, MARKER, `${MARKER}-nobody`],
      ),
    ).rejects.toThrow(/donations_sponsor_id_sponsors_id_fk/);
  });
});

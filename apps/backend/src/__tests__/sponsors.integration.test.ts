import { DonationProvider, type SponsorInput } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import { createDonation, listDonations, readDonationTotals } from "../services/donations.js";
import { readSponsorAvatar, storeSponsorAvatar } from "../services/sponsor-avatars.js";
import {
  createSponsor,
  deleteSponsor,
  listCurrentSponsors,
  listSponsors,
  sponsorExists,
  updateSponsor,
} from "../services/sponsors.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/**
 * Runs the annual sponsors' SQL against the Postgres `TEST_DATABASE_URL` names.
 *
 * Every sponsor, donation and stored picture is created here, named with a
 * marker or made from its bytes, and removed here: donations first, because a
 * removed sponsor leaves its donations behind, and pictures last, because a
 * sponsor points at its picture.
 */
describe.skipIf(!integrationDatabaseUrl())("annual sponsors (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-sponsors-${Date.now()}`;
  const sponsorIds: string[] = [];
  const donationIds: string[] = [];
  const avatarIds: string[] = [];
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM donations WHERE id = ANY($1::text[])", [donationIds]);
    await client.query("DELETE FROM sponsors WHERE id = ANY($1::text[])", [sponsorIds]);
    await client.query("DELETE FROM sponsor_avatars WHERE id = ANY($1::text[])", [avatarIds]);
    await client.end();
    await closeDatabasePool();
  });

  /** A sponsor of the run, with two addresses in a fixed order. */
  const input: SponsorInput = {
    name: MARKER,
    socialMedia: [
      { platform: "mastodon", url: "https://chaos.social/@ada" },
      { platform: "website", url: "https://ada.example" },
    ],
    avatarId: null,
    claim: "",
    published: true,
    paidOn: "2001-03-01",
  };

  async function sponsor(change: Partial<SponsorInput> = {}) {
    const created = await createSponsor({ ...input, ...change });
    sponsorIds.push(created.id);
    return created;
  }

  async function donate(amountCents: number, sponsorId: string | null, receivedOn = "2001-03-01") {
    const donation = await createDonation({
      name: MARKER,
      published: false,
      amountCents,
      receivedOn,
      provider: DonationProvider.BankTransfer,
      note: "",
      sponsorId,
    });
    donationIds.push(donation.id);
    return donation;
  }

  it("stores a sponsor and reads the day and the addresses back unchanged", async () => {
    const created = await sponsor();

    expect(created).toMatchObject({ paidOn: "2001-03-01", socialMedia: input.socialMedia, amountCents: 0 });
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

  it("reads a row that holds plain addresses as the platforms they belong to", async () => {
    const id = `${MARKER}-plain`;
    sponsorIds.push(id);
    await client.query(`INSERT INTO sponsors (id, name, links, paid_on) VALUES ($1, $2, $3::jsonb, '2001-03-01')`, [
      id,
      MARKER,
      JSON.stringify(["https://chaos.social/@ada", "https://github.com/ada"]),
    ]);

    const listed = (await listSponsors()).find((row) => row.id === id);
    expect(listed?.socialMedia).toEqual([
      { platform: "mastodon", url: "https://chaos.social/@ada" },
      { platform: "github", url: "https://github.com/ada" },
    ]);
  });

  /**
   * Stores bytes of this run as a picture, so the row is the run's own.
   *
   * @param suffix - Tells the run's pictures apart.
   * @returns The picture's id.
   */
  async function avatar(suffix: string): Promise<string> {
    const id = await storeSponsorAvatar(Buffer.from(`${MARKER}-${suffix}`));
    avatarIds.push(id);
    return id;
  }

  it("stores a picture once under the hash of its bytes and links it to a sponsor", async () => {
    const id = await avatar("linked");
    expect(await storeSponsorAvatar(Buffer.from(`${MARKER}-linked`))).toBe(id);
    expect((await readSponsorAvatar(id))?.toString()).toBe(`${MARKER}-linked`);

    const created = await sponsor({ avatarId: id });
    expect(created.avatarId).toBe(id);
  });

  it("removes old pictures no sponsor points at when a sponsor is written, and keeps the rest", async () => {
    const kept = await avatar("old-linked");
    const pruned = await avatar("old-unlinked");
    const fresh = await avatar("new-unlinked");
    await client.query("UPDATE sponsor_avatars SET created_at = '2001-01-01' WHERE id = ANY($1::text[])", [
      [kept, pruned],
    ]);

    await sponsor({ avatarId: kept });

    expect(await readSponsorAvatar(kept)).not.toBeNull();
    expect(await readSponsorAvatar(pruned)).toBeNull();
    expect(await readSponsorAvatar(fresh)).not.toBeNull();
  });

  it("shows only published sponsors whose year still runs, the earliest payment first", async () => {
    // A 365-day year ending on 2001-12-31 starts on 2001-01-01.
    const today = "2001-12-31";
    const first = await sponsor({ paidOn: "2001-01-01" });
    const later = await sponsor({ paidOn: "2001-06-01" });
    const expired = await sponsor({ paidOn: "2000-12-31" });
    const unpublished = await sponsor({ paidOn: "2001-06-01", published: false });

    // Only this case's rows, because the cases above leave sponsors of the run
    // standing in the same year.
    const own = new Set([first.id, later.id, expired.id, unpublished.id]);
    const shown = (await listCurrentSponsors(today)).filter((row) => own.has(row.id));

    expect(shown.map((row) => row.id)).toEqual([first.id, later.id]);
    expect(Object.keys(shown[0] ?? {}).sort()).toEqual(["avatarId", "claim", "id", "name", "paidOn", "socialMedia"]);
  });

  it("splits a month's income into the part linked to sponsors and the free donations", async () => {
    // A month no other case of the run books into, so its sums are this case's alone.
    const created = await sponsor({ paidOn: "1999-07-01" });
    await donate(4_000, created.id, "1999-07-10");
    await donate(1_500, null, "1999-07-20");

    const july = (await readDonationTotals("1999-07-31")).byMonth.at(-1);
    const total = Object.values(july?.byProvider ?? {}).reduce((sum, cents) => sum + (cents ?? 0), 0);

    expect(july?.month).toBe("1999-07");
    expect(july?.sponsoredCents).toBe(4_000);
    expect(total).toBe(5_500);
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

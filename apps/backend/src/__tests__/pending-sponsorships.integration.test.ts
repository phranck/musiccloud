import { normalizeSponsorshipReference, type PendingSponsorshipInput } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabasePool } from "../db/pool.js";

vi.mock("../services/sponsor-avatar.js", () => ({
  resolveSponsorAvatar: vi.fn(async () => null),
}));

vi.mock("../services/sponsoring-config.js", () => ({
  getSponsoringConfig: vi.fn(async () => ({ sponsorMinimumCents: 4_000 })),
}));

/** The NodeInfo question a website address is asked, answered by each test. */
const previewMocks = vi.hoisted(() => ({ detectPlatformFromHost: vi.fn(async (): Promise<string | null> => null) }));

vi.mock("../lib/preview-image.js", () => previewMocks);

import {
  createPendingSponsorship,
  deletePendingSponsorship,
  expirePendingSponsorships,
  listPendingSponsorships,
  takeOverPendingSponsorship,
  updatePendingSponsorship,
} from "../services/pending-sponsorships.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/**
 * Runs the sponsorship requests' SQL against the Postgres `TEST_DATABASE_URL`
 * names, with the picture lookup and the sponsoring settings mocked, so no
 * request leaves the machine.
 *
 * Every request, sponsor and donation is named with a marker of the run and
 * removed here: donations first, because a sponsor's removal would leave them
 * behind, then sponsors, then requests.
 */
describe.skipIf(!integrationDatabaseUrl())("sponsorship requests (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-sponsorships-${Date.now()}`;
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await client.query("DELETE FROM donations WHERE name = $1", [MARKER]);
    await client.query("DELETE FROM sponsors WHERE name = $1", [MARKER]);
    await client.query("DELETE FROM pending_sponsorships WHERE name = $1", [MARKER]);
    await client.end();
    await closeDatabasePool();
  });

  /** A form of the run, above the mocked minimum. */
  const FORM: PendingSponsorshipInput = {
    name: MARKER,
    link: "chaos.social/@ada",
    claim: "Music for everybody.",
    amountCents: 5_000,
    published: true,
  };

  /**
   * Announces a form of the run and returns the stored request.
   *
   * @param change - Fields that differ from {@link FORM}.
   */
  async function announce(change: Partial<PendingSponsorshipInput> = {}) {
    const result = await createPendingSponsorship({ ...FORM, ...change });
    if (!result.ok) throw new Error(`announcement refused: ${result.reason}`);
    return result.value;
  }

  it("stores a request under a reference of musiccloud's own and lists it", async () => {
    const stored = await announce();

    expect(normalizeSponsorshipReference(stored.reference)).toBe(stored.reference);
    expect(stored.socialMedia).toEqual([{ platform: "mastodon", url: "https://chaos.social/@ada" }]);
    expect((await listPendingSponsorships()).some((row) => row.id === stored.id)).toBe(true);
    expect(previewMocks.detectPlatformFromHost).not.toHaveBeenCalled();
  });

  it("files an address on no known service as a website", async () => {
    const stored = await announce({ link: "https://kim-lorenz.example" });

    expect(stored.socialMedia).toEqual([{ platform: "website", url: "https://kim-lorenz.example" }]);
  });

  it("files an address as the service its host names through NodeInfo", async () => {
    // A Pixelfed profile is a single path segment on a host of its own, which
    // is exactly what a personal website looks like by its address.
    previewMocks.detectPlatformFromHost.mockResolvedValueOnce("pixelfed");

    const stored = await announce({ link: "https://pixels.kim-lorenz.example/kim" });

    expect(previewMocks.detectPlatformFromHost).toHaveBeenCalledWith("https://pixels.kim-lorenz.example/kim");
    expect(stored.socialMedia).toEqual([{ platform: "pixelfed", url: "https://pixels.kim-lorenz.example/kim" }]);
  });

  it("refuses an amount below the minimum and stores nothing", async () => {
    const result = await createPendingSponsorship({ ...FORM, amountCents: 100, claim: `${MARKER}-low` });

    expect(result).toEqual({ ok: false, reason: "amount_too_low", minimumCents: 4_000 });
    const rows = await client.query("SELECT 1 FROM pending_sponsorships WHERE claim = $1", [`${MARKER}-low`]);
    expect(rows.rowCount).toBe(0);
  });

  it("rewrites a request by its printed reference and keeps the reference", async () => {
    const stored = await announce();
    const printed = stored.reference.replace(/(.{4})/g, "$1 ").toLowerCase();

    const result = await updatePendingSponsorship(printed, { ...FORM, claim: "Still here." });

    expect(result).toMatchObject({
      ok: true,
      value: { id: stored.id, reference: stored.reference, claim: "Still here." },
    });
  });

  it("answers not found for a sound reference nobody was issued", async () => {
    const result = await updatePendingSponsorship("RF71MCSP000000000000", FORM);

    expect(result.ok ? null : result.reason).toBe("not_found");
  });

  it("takes a request over into a sponsor and a linked donation, and removes the request", async () => {
    const stored = await announce();

    const result = await takeOverPendingSponsorship(stored.id, { amountCents: 6_000, paidOn: "2001-03-01" });
    if (!result.ok) throw new Error(`takeover refused: ${result.reason}`);

    expect(result.value).toMatchObject({ name: MARKER, paidOn: "2001-03-01", published: true, amountCents: 6_000 });
    const donations = await client.query<{ amount_cents: number; provider: string }>(
      "SELECT amount_cents, provider FROM donations WHERE sponsor_id = $1",
      [result.value.id],
    );
    expect(donations.rows).toEqual([{ amount_cents: 6_000, provider: "bank-transfer" }]);
    const left = await client.query("SELECT 1 FROM pending_sponsorships WHERE id = $1", [stored.id]);
    expect(left.rowCount).toBe(0);
  });

  it("writes nothing and keeps the request when a step of the takeover fails", async () => {
    const stored = await announce({ claim: `${MARKER}-rollback` });

    // An amount the ledger's check constraint refuses, so the donation fails
    // after the sponsor was written inside the same transaction.
    await expect(takeOverPendingSponsorship(stored.id, { amountCents: 0, paidOn: "2001-03-01" })).rejects.toThrow();

    const sponsors = await client.query("SELECT 1 FROM sponsors WHERE name = $1 AND claim = $2", [
      MARKER,
      `${MARKER}-rollback`,
    ]);
    expect(sponsors.rowCount).toBe(0);
    const kept = await client.query("SELECT 1 FROM pending_sponsorships WHERE id = $1", [stored.id]);
    expect(kept.rowCount).toBe(1);
  });

  it("answers not found when the request is gone", async () => {
    const result = await takeOverPendingSponsorship(`${MARKER}-gone`, { amountCents: 6_000, paidOn: "2001-03-01" });

    expect(result.ok ? null : result.reason).toBe("not_found");
  });

  it("removes a request once", async () => {
    const stored = await announce();

    expect(await deletePendingSponsorship(stored.id)).toBe(true);
    expect(await deletePendingSponsorship(stored.id)).toBe(false);
  });

  it("expires only the requests older than sixty days", async () => {
    const old = await announce();
    const young = await announce();
    // Dates of the run's own rows, far enough back that no other row predates them.
    await client.query("UPDATE pending_sponsorships SET created_at = '1990-01-01' WHERE id = $1", [old.id]);
    await client.query("UPDATE pending_sponsorships SET created_at = '1990-02-15' WHERE id = $1", [young.id]);

    // Sixty days before 1990-03-10 is 1990-01-09: the first is older, the second is not.
    expect(await expirePendingSponsorships(new Date("1990-03-10T00:00:00Z"))).toBe(1);

    const left = await client.query<{ id: string }>("SELECT id FROM pending_sponsorships WHERE id = ANY($1::text[])", [
      [old.id, young.id],
    ]);
    expect(left.rows.map((row) => row.id)).toEqual([young.id]);
  });
});

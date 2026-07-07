import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tier, TierCreateData } from "../../tiers-repository.js";
import { PostgresTierRepository } from "../postgres-tiers.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL` (MC-106, migration 0066).
 * Exercises the "at most one recommended tier" invariant enforced by
 * PostgresTierRepository: create defaults to false, setting `true` clears the
 * flag on every other tier, setting `false` leaves none, and deleting the
 * recommended tier does NOT auto-promote another.
 *
 * The invariant is global by design (setting one true clears ALL others), so
 * the test snapshots the pre-existing recommended tier in `beforeAll` and
 * restores it in `afterAll` — the shared DB's real recommended state is left
 * exactly as it was found. Test tiers use random names and are deleted after.
 */
describe.skipIf(!process.env.DATABASE_URL)("tiers recommended invariant (integration)", () => {
  let pool: pgModule.Pool;
  let repo: PostgresTierRepository;
  const createdIds: string[] = [];
  let originalRecommendedId: string | null = null;

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    repo = new PostgresTierRepository(pool);
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM tiers WHERE recommended = true LIMIT 1");
    originalRecommendedId = rows[0]?.id ?? null;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await pool.query("DELETE FROM tiers WHERE id = $1", [id]);
    }
    // Restore the pre-test recommended state. COALESCE turns the NULL that
    // `id = NULL` yields (when nothing was recommended) into `false`, so a null
    // snapshot correctly clears the flag everywhere without hitting NOT NULL.
    await pool.query("UPDATE tiers SET recommended = COALESCE(id = $1, false)", [originalRecommendedId]);
    await pool.end();
  });

  function unique(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function createTracked(data: Partial<TierCreateData> = {}): Promise<Tier> {
    const tier = await repo.createTier({
      name: unique("mc106-tier"),
      requestsPerMinute: 60,
      requestsPerDay: 10000,
      ...data,
    });
    createdIds.push(tier.id);
    return tier;
  }

  async function recommendedTiers(): Promise<Tier[]> {
    return (await repo.listTiers()).filter((t) => t.recommended);
  }

  it("defaults recommended to false on create", async () => {
    const tier = await createTracked();
    expect(tier.recommended).toBe(false);
  });

  it("setting recommended=true clears the flag on every other tier", async () => {
    const first = await createTracked({ recommended: true });
    const second = await createTracked();

    const updated = await repo.updateTier(second.id, { recommended: true });
    expect(updated.recommended).toBe(true);

    const recommended = await recommendedTiers();
    expect(recommended).toHaveLength(1);
    expect(recommended[0]?.id).toBe(second.id);

    const reloadedFirst = (await repo.listTiers()).find((t) => t.id === first.id);
    expect(reloadedFirst?.recommended).toBe(false);
  });

  it("setting recommended=false leaves none recommended", async () => {
    const tier = await createTracked({ recommended: true });
    await repo.updateTier(tier.id, { recommended: false });
    expect(await recommendedTiers()).toHaveLength(0);
  });

  it("deleting the recommended tier leaves none recommended (no auto-promote)", async () => {
    const other = await createTracked();
    const recommended = await createTracked({ recommended: true });

    await repo.deleteTier(recommended.id);

    const stillRecommended = await recommendedTiers();
    expect(stillRecommended).toHaveLength(0);
    const reloadedOther = (await repo.listTiers()).find((t) => t.id === other.id);
    expect(reloadedOther?.recommended).toBe(false);
  });
});

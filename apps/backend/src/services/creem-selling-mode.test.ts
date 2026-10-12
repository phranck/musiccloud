/**
 * Unit tests for the switch that decides whether a purchase moves real money.
 *
 * Both refusals are the point of this module. An environment with no key
 * cannot be reached, and an environment missing a product for a plan somebody
 * can buy would show that plan at its offer's amount whilst the checkout has
 * nothing to sell, which looks like it works.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  configuredCreemModes: vi.fn(),
  listTiers: vi.fn(),
  listAllOffers: vi.fn(),
  listAllCreemProductMappings: vi.fn(),
}));

vi.mock("./site-settings.js", () => ({ getSetting: mocks.getSetting, setSetting: mocks.setSetting }));

vi.mock("../db/index.js", () => ({
  getTierRepository: async () => ({
    listTiers: mocks.listTiers,
    listAllOffers: mocks.listAllOffers,
    listAllCreemProductMappings: mocks.listAllCreemProductMappings,
  }),
}));

vi.mock("../lib/creem-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/creem-config.js")>()),
  configuredCreemModes: mocks.configuredCreemModes,
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), deviation: vi.fn() },
}));

import { CreemMode, type CreemModeValue } from "@musiccloud/shared";
import { getSellingMode, SellingModeRefusal, sellingModeReadiness, setSellingMode } from "./creem-selling-mode.js";

/** A plan as the repository lists it, enabled unless said otherwise. */
function plan(id: string, name: string, enabled = true) {
  return { id, name, enabled };
}

/** An offer of a plan over one billing period. */
function offer(tierId: string, billingPeriod: string) {
  return { tierId, billingPeriod };
}

/** A product mapping of one plan and period in one environment. */
function mapping(tierId: string, billingPeriod: string, mode: CreemModeValue) {
  return { tierId, billingPeriod, mode, creemProductId: `prod_${tierId}_${billingPeriod}_${mode}` };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.configuredCreemModes.mockReturnValue([CreemMode.Test, CreemMode.Live]);
  mocks.getSetting.mockResolvedValue(null);
  mocks.listTiers.mockResolvedValue([plan("tier_club", "Club")]);
  mocks.listAllOffers.mockResolvedValue([offer("tier_club", "every-month")]);
  mocks.listAllCreemProductMappings.mockResolvedValue([
    mapping("tier_club", "every-month", CreemMode.Test),
    mapping("tier_club", "every-month", CreemMode.Live),
  ]);
});

describe("getSellingMode", () => {
  it("sells from the sandbox when nothing has been chosen", async () => {
    expect(await getSellingMode()).toBe(CreemMode.Test);
  });

  it("sells live once that has been chosen", async () => {
    mocks.getSetting.mockResolvedValue("live");
    expect(await getSellingMode()).toBe(CreemMode.Live);
  });

  it("falls back to the sandbox rather than trusting an unreadable value", async () => {
    mocks.getSetting.mockResolvedValue("prod");
    expect(await getSellingMode()).toBe(CreemMode.Test);
  });
});

describe("setSellingMode", () => {
  it("moves the shop and records what it moved from", async () => {
    const refusal = await setSellingMode(CreemMode.Live);

    expect(refusal).toBeNull();
    expect(mocks.setSetting).toHaveBeenCalledWith("creem_selling_mode", CreemMode.Live);
  });

  it("refuses an environment this deployment has no key for", async () => {
    mocks.configuredCreemModes.mockReturnValue([CreemMode.Test]);

    const refusal = await setSellingMode(CreemMode.Live);

    expect(refusal?.refusal).toBe(SellingModeRefusal.NoKey);
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("refuses whilst a buyable plan has no product there, and names which", async () => {
    mocks.listTiers.mockResolvedValue([plan("tier_club", "Club"), plan("tier_pro", "Pro")]);
    mocks.listAllOffers.mockResolvedValue([
      offer("tier_club", "every-month"),
      offer("tier_club", "every-year"),
      offer("tier_pro", "every-month"),
    ]);
    mocks.listAllCreemProductMappings.mockResolvedValue([
      mapping("tier_club", "every-month", CreemMode.Test),
      mapping("tier_club", "every-month", CreemMode.Live),
      mapping("tier_club", "every-year", CreemMode.Test),
      mapping("tier_pro", "every-month", CreemMode.Test),
    ]);

    const refusal = await setSellingMode(CreemMode.Live);

    expect(refusal?.refusal).toBe(SellingModeRefusal.MissingProducts);
    expect(refusal?.missing).toEqual(["Club (every-year)", "Pro (every-month)"]);
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("allows the move back to the sandbox, which sells nothing real", async () => {
    mocks.getSetting.mockResolvedValue("live");

    const refusal = await setSellingMode(CreemMode.Test);

    expect(refusal).toBeNull();
    expect(mocks.setSetting).toHaveBeenCalledWith("creem_selling_mode", CreemMode.Test);
  });
});

describe("sellingModeReadiness", () => {
  it("leaves out a disabled plan and a plan with no offer, because nobody can buy them", async () => {
    mocks.listTiers.mockResolvedValue([
      plan("tier_club", "Club"),
      plan("tier_old", "Old", false),
      plan("tier_free", "Free"),
    ]);
    mocks.listAllOffers.mockResolvedValue([offer("tier_club", "every-month"), offer("tier_old", "every-month")]);
    mocks.listAllCreemProductMappings.mockResolvedValue([mapping("tier_club", "every-month", CreemMode.Test)]);

    expect(await sellingModeReadiness()).toEqual([
      { mode: CreemMode.Test, hasKey: true, missingProducts: [] },
      { mode: CreemMode.Live, hasKey: true, missingProducts: ["Club (every-month)"] },
    ]);
  });

  it("calls an environment ready exactly when the switch accepts it, for every combination", async () => {
    const choices: CreemModeValue[][] = [[], [CreemMode.Test], [CreemMode.Live], [CreemMode.Test, CreemMode.Live]];

    for (const keys of choices) {
      for (const mapped of choices) {
        mocks.configuredCreemModes.mockReturnValue(keys);
        mocks.listAllCreemProductMappings.mockResolvedValue(
          mapped.map((mode) => mapping("tier_club", "every-month", mode)),
        );
        const readiness = await sellingModeReadiness();

        for (const entry of readiness) {
          mocks.setSetting.mockReset();
          const ready = entry.hasKey && entry.missingProducts.length === 0;
          const accepted = (await setSellingMode(entry.mode)) === null;

          expect(accepted, `keys ${keys.join("+")}, products ${mapped.join("+")}, ${entry.mode}`).toBe(ready);
          expect(mocks.setSetting.mock.calls.length > 0).toBe(ready);
        }
      }
    }
  });
});

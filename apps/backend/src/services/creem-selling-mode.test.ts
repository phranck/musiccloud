/**
 * Unit tests for the switch that decides whether a purchase moves real money.
 *
 * Both refusals are the point of this module. An environment with no key
 * cannot be reached, and an environment missing a product for a plan somebody
 * can buy would show that plan at its database price whilst the checkout has
 * nothing to sell, which looks like it works.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  configuredCreemModes: vi.fn(),
}));

vi.mock("./site-settings.js", () => ({ getSetting: mocks.getSetting, setSetting: mocks.setSetting }));

vi.mock("../lib/creem-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/creem-config.js")>()),
  configuredCreemModes: mocks.configuredCreemModes,
}));

vi.mock("../lib/infra/logger.js", () => ({
  log: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), deviation: vi.fn() },
}));

import { CreemMode } from "../lib/creem-config.js";
import { getSellingMode, SellingModeRefusal, setSellingMode } from "./creem-selling-mode.js";

/** One plan and interval that has a product in the given environments. */
function plan(label: string, ...modes: (typeof CreemMode)[keyof typeof CreemMode][]) {
  return { label, modes };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.configuredCreemModes.mockReturnValue([CreemMode.Test, CreemMode.Live]);
  mocks.getSetting.mockResolvedValue(null);
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
    const refusal = await setSellingMode(CreemMode.Live, [plan("Club (month)", CreemMode.Test, CreemMode.Live)]);

    expect(refusal).toBeNull();
    expect(mocks.setSetting).toHaveBeenCalledWith("creem_selling_mode", CreemMode.Live);
  });

  it("refuses an environment this deployment has no key for", async () => {
    mocks.configuredCreemModes.mockReturnValue([CreemMode.Test]);

    const refusal = await setSellingMode(CreemMode.Live, []);

    expect(refusal?.refusal).toBe(SellingModeRefusal.NoKey);
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("refuses whilst a buyable plan has no product there, and names which", async () => {
    const refusal = await setSellingMode(CreemMode.Live, [
      plan("Club (month)", CreemMode.Test, CreemMode.Live),
      plan("Club (year)", CreemMode.Test),
      plan("Pro (month)", CreemMode.Test),
    ]);

    expect(refusal?.refusal).toBe(SellingModeRefusal.MissingProducts);
    expect(refusal?.missing).toEqual(["Club (year)", "Pro (month)"]);
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("allows the move back to the sandbox, which sells nothing real", async () => {
    mocks.getSetting.mockResolvedValue("live");

    const refusal = await setSellingMode(CreemMode.Test, [plan("Club (month)", CreemMode.Test, CreemMode.Live)]);

    expect(refusal).toBeNull();
    expect(mocks.setSetting).toHaveBeenCalledWith("creem_selling_mode", CreemMode.Test);
  });
});

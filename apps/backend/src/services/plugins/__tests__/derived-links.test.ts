import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/plugin-repository.js", () => ({ readPluginStatesFromDb: vi.fn() }));

import { readPluginStatesFromDb } from "../../../db/plugin-repository.js";
import { filterDisabledLinks, invalidateEnabledCache } from "../registry.js";

beforeEach(() => {
  invalidateEnabledCache();
  vi.mocked(readPluginStatesFromDb).mockResolvedValue([]);
});

describe("derived destination availability", () => {
  it("hides a persisted YouTube Music destination when its parent is disabled", async () => {
    vi.mocked(readPluginStatesFromDb).mockResolvedValue([{ id: "youtube", enabled: false, updatedAt: new Date() }]);
    const links = [{ service: "youtube" }, { service: "youtube-music" }, { service: "deezer" }];
    expect(await filterDisabledLinks(links)).toEqual([{ service: "deezer" }]);
  });

  it("keeps both video destinations while the parent is enabled", async () => {
    vi.mocked(readPluginStatesFromDb).mockResolvedValue([{ id: "youtube", enabled: true, updatedAt: new Date() }]);
    const links = [{ service: "youtube" }, { service: "youtube-music" }];
    expect(await filterDisabledLinks(links)).toEqual(links);
  });
});

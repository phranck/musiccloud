/**
 * A plugin's name is the label `PLATFORM_CONFIG` gives its service, in the
 * manifest the Services page reads and in the adapter the resolver reads, so
 * the dashboard, an error message and a share page name a service one way.
 */
import { getPlatformLabel } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/plugin-repository.js", () => ({ readPluginStatesFromDb: vi.fn() }));

const { listPlugins } = await import("../registry.js");

describe("plugin display names", () => {
  it.each(
    listPlugins().map((plugin) => [plugin.manifest.id, plugin] as const),
  )("%s carries its platform label in the manifest and the adapter", (id, plugin) => {
    expect(plugin.manifest.displayName).toBe(getPlatformLabel(id));
    expect(plugin.adapter.displayName).toBe(getPlatformLabel(id));
  });
});

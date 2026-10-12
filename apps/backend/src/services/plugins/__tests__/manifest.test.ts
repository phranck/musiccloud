/**
 * @file Tests the one answer to "can this plugin serve traffic", read from its
 * manifest, and that every installed plugin's manifest gives it.
 */
import { Service } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { evaluatePluginEnv, type PluginManifest } from "../manifest.js";
import { listPlugins } from "../registry.js";

const SIGNED: PluginManifest = {
  id: Service.AppleMusic,
  displayName: "Signed",
  description: "",
  defaultEnabled: true,
  requiredEnv: ["KEY_ID", "TEAM_ID"],
  alternativeEnv: ["READY_TOKEN"],
};

describe("evaluatePluginEnv", () => {
  it("counts a plugin available when every required variable is set", () => {
    expect(evaluatePluginEnv(SIGNED, { KEY_ID: "k", TEAM_ID: "t" })).toEqual({ available: true, missingEnv: [] });
  });

  it("lists the required variables that are missing, and counts an empty one as missing", () => {
    expect(evaluatePluginEnv(SIGNED, { KEY_ID: "k", TEAM_ID: "" })).toEqual({
      available: false,
      missingEnv: ["TEAM_ID"],
    });
  });

  it("counts the alternative set as enough on its own, and then lists nothing as missing", () => {
    expect(evaluatePluginEnv(SIGNED, { READY_TOKEN: "r" })).toEqual({ available: true, missingEnv: [] });
  });

  it("counts a plugin without required variables available in any environment", () => {
    const keyless: PluginManifest = { ...SIGNED, requiredEnv: undefined, alternativeEnv: undefined };
    expect(evaluatePluginEnv(keyless, {})).toEqual({ available: true, missingEnv: [] });
  });
});

describe("installed plugins", () => {
  it("are unavailable without their required variables and available with them", () => {
    for (const { manifest } of listPlugins()) {
      const required = manifest.requiredEnv ?? [];
      if (required.length === 0) continue;
      const allSet = Object.fromEntries(required.map((name) => [name, "set"]));

      expect(evaluatePluginEnv(manifest, {}).available, manifest.id).toBe(false);
      expect(evaluatePluginEnv(manifest, allSet).available, manifest.id).toBe(true);
    }
  });
});

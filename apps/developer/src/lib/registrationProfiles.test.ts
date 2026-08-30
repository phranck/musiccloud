import { describe, expect, it } from "vitest";
import { ClientRegistrationType } from "./apiAccessClient";
import { REGISTRATION_PROFILES, registrationProfileCopy } from "./registrationProfiles";

describe("registration profile copy", () => {
  it("describes exactly the three profiles the route admits", () => {
    expect(REGISTRATION_PROFILES.map((profile) => profile.type)).toEqual([
      ClientRegistrationType.Development,
      ClientRegistrationType.Confidential,
      ClientRegistrationType.Public,
    ]);
  });

  it("says for every profile what it is for, where its credential lives and what it must not do", () => {
    for (const profile of REGISTRATION_PROFILES) {
      expect(profile.purpose.length, profile.type).toBeGreaterThan(0);
      expect(profile.credentialHome.length, profile.type).toBeGreaterThan(0);
      expect(profile.neverDo.length, profile.type).toBeGreaterThan(0);
    }
  });

  it("resolves a profile by its wire value and nothing else", () => {
    expect(registrationProfileCopy("confidential")?.label).toBe("Confidential");
    expect(registrationProfileCopy("legacy_api_key")).toBeUndefined();
  });
});

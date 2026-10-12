import { describe, expect, it } from "vitest";

import type { ArtistGroupMembershipRecord } from "../../db/repository.js";
import { toPublicMemberships } from "./public.js";

const membership = (overrides: Partial<ArtistGroupMembershipRecord>): ArtistGroupMembershipRecord => ({
  membershipId: "membership-1",
  groupArtistEntityId: "artist-radiohead",
  groupName: "Radiohead",
  memberArtistEntityId: "artist-thom",
  memberName: "Thom Yorke",
  memberNameCredit: null,
  roles: [],
  beginDate: null,
  beginDatePrecision: "unknown",
  beginYear: null,
  beginMonth: null,
  beginDay: null,
  endDate: null,
  endDatePrecision: "unknown",
  endYear: null,
  endMonth: null,
  endDay: null,
  isCurrent: null,
  sourceProvider: "musicbrainz",
  sourceUrl: null,
  sourceFetchedAt: null,
  confidence: 0.9,
  ...overrides,
});

describe("toPublicMemberships", () => {
  it("merges rows for the same stint and keeps different stints apart", () => {
    const result = toPublicMemberships([
      membership({ membershipId: "a", roles: ["piano"], beginDatePrecision: "year", beginYear: 1985 }),
      membership({ membershipId: "b", roles: ["lead vocals", "piano"], beginDatePrecision: "year", beginYear: 1985 }),
      membership({ membershipId: "c", roles: ["guitar"], beginDatePrecision: "year", beginYear: 2010 }),
    ]);

    expect(result.map((entry) => [entry.begin?.year, entry.roles])).toEqual([
      [1985, ["lead vocals", "piano"]],
      [2010, ["guitar"]],
    ]);
  });

  it("keeps the same member in different groups apart", () => {
    const result = toPublicMemberships([
      membership({ groupArtistEntityId: "artist-radiohead" }),
      membership({ groupArtistEntityId: "artist-atoms", groupName: "Atoms for Peace" }),
    ]);

    expect(result.map((entry) => entry.groupName)).toEqual(["Radiohead", "Atoms for Peace"]);
  });

  it("builds every entry from the public fields alone", () => {
    const [entry] = toPublicMemberships([membership({ sourceUrl: "https://musicbrainz.org/artist/x" })]);

    expect(Object.keys(entry).sort()).toEqual([
      "begin",
      "end",
      "groupArtistEntityId",
      "groupName",
      "isCurrent",
      "memberArtistEntityId",
      "memberName",
      "roles",
    ]);
  });
});

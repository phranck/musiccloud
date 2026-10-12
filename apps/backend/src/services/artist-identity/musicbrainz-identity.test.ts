import { describe, expect, it } from "vitest";

import radiohead from "./__fixtures__/musicbrainz-artist-radiohead.json";
import thomYorke from "./__fixtures__/musicbrainz-artist-thom-yorke.json";
import spotifyRadiohead from "./__fixtures__/musicbrainz-url-spotify-radiohead.json";
import {
  entityTypeForMusicBrainzType,
  type MbIdentityArtist,
  type MbUrlLookup,
  mapMusicBrainzIdentity,
  musicBrainzIdFromUrlLookup,
  parseMusicBrainzDate,
} from "./musicbrainz-identity.js";

// The fixtures are MusicBrainz answers recorded on 2026-10-12, trimmed to the
// fields the enrichment reads. MusicBrainz core data is CC0.

describe("parseMusicBrainzDate", () => {
  it.each([
    ["1968-10-07", { value: "1968-10-07", precision: "day", year: 1968, month: 10, day: 7 }],
    ["1991-06", { value: null, precision: "month", year: 1991, month: 6, day: null }],
    ["1991", { value: null, precision: "year", year: 1991, month: null, day: null }],
    ["1991-13", null],
    ["1991-02-32", null],
    ["", null],
    [null, null],
  ] as const)("reads %s", (text, expected) => {
    expect(parseMusicBrainzDate(text)).toEqual(expected);
  });
});

describe("entityTypeForMusicBrainzType", () => {
  it.each([
    ["Person", "person"],
    ["Group", "group"],
    ["Orchestra", "group"],
    ["Choir", "group"],
    ["Character", "persona"],
    ["Other", "unknown"],
    [null, "unknown"],
  ] as const)("maps %s to %s", (type, expected) => {
    expect(entityTypeForMusicBrainzType(type)).toBe(expected);
  });
});

describe("mapMusicBrainzIdentity", () => {
  it("dates a group's formation and lists each member once with all their roles", () => {
    const snapshot = mapMusicBrainzIdentity(radiohead as MbIdentityArtist);

    expect(snapshot).toMatchObject({
      providerArtistId: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
      sourceUrl: "https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711",
      entityType: "group",
      events: [{ eventType: "formed", date: { value: null, precision: "year", year: 1991, month: null, day: null } }],
    });
    // MusicBrainz lists twenty relations for five people, one per instrument.
    expect(snapshot.memberships.map((membership) => membership.counterpart.name).sort()).toEqual([
      "Colin Greenwood",
      "Ed O’Brien",
      "Jonny Greenwood",
      "Philip Selway",
      "Thom Yorke",
    ]);
    const colin = snapshot.memberships.find((membership) => membership.counterpart.name === "Colin Greenwood");
    expect(colin).toEqual({
      side: "group",
      counterpart: {
        providerArtistId: "f23074f4-2c06-477a-bf1d-12fa66e087ee",
        name: "Colin Greenwood",
        entityType: "person",
      },
      begin: null,
      end: null,
      isCurrent: true,
      roles: expect.arrayContaining(["double bass", "electric bass guitar", "original", "sampler"]),
    });
  });

  it("dates a person's birth and keeps separate stints in different bands apart", () => {
    const snapshot = mapMusicBrainzIdentity(thomYorke as MbIdentityArtist);

    expect(snapshot.entityType).toBe("person");
    expect(snapshot.events).toEqual([
      { eventType: "birth", date: { value: "1968-10-07", precision: "day", year: 1968, month: 10, day: 7 } },
    ]);
    const byGroup = new Map(snapshot.memberships.map((membership) => [membership.counterpart.name, membership]));
    expect([...byGroup.keys()].sort()).toEqual([
      "Atoms for Peace",
      "Headless Chickens",
      "On a Friday",
      "Radiohead",
      "The Smile",
      "The Venus in Furs",
    ]);
    expect(snapshot.memberships).toHaveLength(6);
    expect(byGroup.get("Radiohead")).toMatchObject({
      side: "member",
      isCurrent: true,
      roles: ["acoustic guitar", "electric guitar", "lead vocals", "original", "piano", "synthesizer"],
    });
    expect(byGroup.get("Headless Chickens")).toMatchObject({
      isCurrent: false,
      begin: { precision: "year", year: 1989 },
      end: { precision: "year", year: 1989 },
    });
    expect(byGroup.get("On a Friday")).toMatchObject({ isCurrent: false, begin: null, end: { year: 1991 } });
  });

  it("records no lifecycle dates for an artist of unknown type", () => {
    const snapshot = mapMusicBrainzIdentity({
      id: "artist-id",
      name: "Somebody",
      type: null,
      "life-span": { begin: "1970", end: null, ended: false },
    });

    expect(snapshot.entityType).toBe("unknown");
    expect(snapshot.events).toEqual([]);
  });
});

describe("musicBrainzIdFromUrlLookup", () => {
  it("names the one artist a streaming page belongs to", () => {
    expect(musicBrainzIdFromUrlLookup(spotifyRadiohead as MbUrlLookup)).toBe("a74b1b7f-71a5-4011-9441-d0b5e4122711");
  });

  it("names nobody when two artists claim the page or none does", () => {
    const relation = (id: string) => ({
      type: "free streaming",
      "target-type": "artist",
      artist: { id, name: id },
    });

    expect(musicBrainzIdFromUrlLookup({ relations: [relation("one"), relation("two")] })).toBeNull();
    expect(musicBrainzIdFromUrlLookup({ relations: [] })).toBeNull();
  });
});

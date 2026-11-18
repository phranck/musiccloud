import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditedRelease, MIN_ACCOUNT_RELEASES, publishesOtherArtists, splitCreditedTitle } from "../label-credits";
import { bandcampTransport } from "../transport";

/** The label account the reported album is published on. */
const LABEL = { id: 2602468135, name: "Iron BoneHead Productions" };

/** The band the reported album belongs to. */
const BAND = { id: 2189513375, name: "TEMPLE NIGHTSIDE" };

/** The en dash and the em dash, built from their code points so no source line holds either character. */
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);

/** A `band_details` answer listing the given release titles. */
function bandDetails(titles: readonly string[]): Response {
  return Response.json({ discography: titles.map((title) => ({ title })) });
}

/** Release titles the way the label names them, every one crediting another band. */
const LABEL_TITLES = [
  "Temple Nightside - Cenotaph Severance",
  "Embrace of Thorns / Invocation - Invoking the Noumenon",
  "Sabbat - Sabbatrinity",
  "Profanatica - Rotting Incarnation of God",
  "Necrowretch - Swords of Dajjal",
  "Kommandant - The Draconian Archetype",
];

/** Release titles the way the band names them, one of them crediting a split partner. */
const BAND_TITLES = [
  "Cenotaph Severance",
  "Temple Nightside - Winds of a Lost Soul (Arcana Cover)",
  "Call of the Maelstrom - Split w/Vassafor",
  "The Notion of Fire",
  "Pillars of Damnation",
  "Leprous Grace",
];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("splitCreditedTitle", () => {
  it("reads the band and the title out of `Band - Title`", () => {
    expect(splitCreditedTitle("Temple Nightside - Cenotaph Severance", LABEL.name)).toEqual({
      artist: "Temple Nightside",
      title: "Cenotaph Severance",
    });
  });

  it.each([EN_DASH, EM_DASH])("accepts %s as the separator", (dash) => {
    expect(splitCreditedTitle(`Sabbat ${dash} Sabbatrinity`, LABEL.name)).toEqual({
      artist: "Sabbat",
      title: "Sabbatrinity",
    });
  });

  it("splits at the first separator, so the title keeps its own", () => {
    expect(splitCreditedTitle("Sabbat - Live - Tokyo 1999", LABEL.name)).toEqual({
      artist: "Sabbat",
      title: "Live - Tokyo 1999",
    });
  });

  it.each([
    ["a title that names the account itself", "Temple Nightside - Winds of a Lost Soul", BAND.name],
    ["a hyphen without spaces", "Spider-Man Theme", LABEL.name],
    ["a title without a separator", "Cenotaph Severance", LABEL.name],
  ])("leaves %s alone", (_case, title, account) => {
    expect(splitCreditedTitle(title, account)).toBeNull();
  });
});

describe("publishesOtherArtists", () => {
  it("recognises an account that credits another band in every title", () => {
    expect(publishesOtherArtists(LABEL_TITLES, LABEL.name)).toBe(true);
  });

  it("does not take a band with a split and a cover for such an account", () => {
    expect(publishesOtherArtists(BAND_TITLES, BAND.name)).toBe(false);
  });

  it("decides nothing from too few releases", () => {
    expect(publishesOtherArtists(LABEL_TITLES.slice(0, MIN_ACCOUNT_RELEASES - 1), LABEL.name)).toBe(false);
  });
});

describe("creditedRelease", () => {
  it("credits the band when the label publishes as `Band - Title`", async () => {
    const request = vi.spyOn(bandcampTransport, "request").mockResolvedValue(bandDetails(LABEL_TITLES));

    const credit = await creditedRelease("Temple Nightside - Cenotaph Severance", LABEL.name, LABEL);

    expect(credit).toEqual({ artist: "Temple Nightside", title: "Cenotaph Severance" });
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("band_details"),
      expect.any(Number),
      `{"band_id":${LABEL.id}}`,
    );
  });

  it("keeps a band's own title that contains ` - `", async () => {
    vi.spyOn(bandcampTransport, "request").mockResolvedValue(bandDetails(BAND_TITLES));

    expect(await creditedRelease("Call of the Maelstrom - Split w/Vassafor", BAND.name, BAND)).toBeNull();
  });

  it("asks nothing when the page already names an artist other than the account", async () => {
    const request = vi.spyOn(bandcampTransport, "request");

    expect(await creditedRelease("Temple Nightside - Cenotaph Severance", "Temple Nightside", LABEL)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("asks nothing for a title without `Band - Title`", async () => {
    const request = vi.spyOn(bandcampTransport, "request");

    expect(await creditedRelease("Cenotaph Severance", LABEL.name, LABEL)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the page's data and logs when the account lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(bandcampTransport, "request").mockResolvedValue(new Response("Busy", { status: 503 }));

    expect(await creditedRelease("Temple Nightside - Cenotaph Severance", LABEL.name, LABEL)).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).toContain("bandcamp_account_releases");
  });
});

import { describe, expect, it } from "vitest";
import { parseJamendoLink } from "../jamendo-link.js";
import { ResourceKind } from "../services.js";

describe("parseJamendoLink", () => {
  it("recognizes a track link as Jamendo hands it out", () => {
    expect(parseJamendoLink("https://jamendo.com/track/459544")).toEqual({
      kind: ResourceKind.Track,
      jamendoId: "459544",
    });
  });

  it("recognizes album and artist links with a name slug", () => {
    expect(parseJamendoLink("https://www.jamendo.com/album/54844/best-of-vol-2")).toEqual({
      kind: ResourceKind.Album,
      jamendoId: "54844",
    });
    expect(parseJamendoLink("https://www.jamendo.com/artist/5261/juanitos")).toEqual({
      kind: ResourceKind.Artist,
      jamendoId: "5261",
    });
  });

  it("skips a language segment in front of the entity path", () => {
    expect(parseJamendoLink("https://www.jamendo.com/de/track/459544/everybody-loves-the-partys")).toEqual({
      kind: ResourceKind.Track,
      jamendoId: "459544",
    });
    expect(parseJamendoLink("https://www.jamendo.com/fr/artist/5261")).toEqual({
      kind: ResourceKind.Artist,
      jamendoId: "5261",
    });
  });

  it("accepts subdomains, http, a query string, surrounding whitespace and a missing scheme", () => {
    const track = { kind: ResourceKind.Track, jamendoId: "26738" };
    expect(parseJamendoLink("https://en.jamendo.com/track/26738/alone")).toEqual(track);
    expect(parseJamendoLink("http://www.jamendo.com/track/26738?language=de")).toEqual(track);
    expect(parseJamendoLink("  https://www.jamendo.com/track/26738  ")).toEqual(track);
    expect(parseJamendoLink("www.jamendo.com/track/26738")).toEqual(track);
    expect(parseJamendoLink("jamendo.com/TRACK/26738")).toEqual(track);
  });

  it("rejects other pages, non-numeric ids, other hosts and free text", () => {
    expect(parseJamendoLink("https://www.jamendo.com/")).toBeNull();
    expect(parseJamendoLink("https://www.jamendo.com/start")).toBeNull();
    expect(parseJamendoLink("https://www.jamendo.com/playlist/500368")).toBeNull();
    expect(parseJamendoLink("https://www.jamendo.com/track/abc")).toBeNull();
    expect(parseJamendoLink("https://www.jamendo.com/de/constructor/1")).toBeNull();
    expect(parseJamendoLink("https://notjamendo.com/track/26738")).toBeNull();
    expect(parseJamendoLink("https://jamendo.com.example.org/track/26738")).toBeNull();
    expect(parseJamendoLink("https://open.spotify.com/track/26738")).toBeNull();
    expect(parseJamendoLink("ftp://jamendo.com/track/26738")).toBeNull();
    expect(parseJamendoLink("jamendo track 26738")).toBeNull();
    expect(parseJamendoLink("")).toBeNull();
  });
});

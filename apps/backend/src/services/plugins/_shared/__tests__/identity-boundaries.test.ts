import { describe, expect, it } from "vitest";
import type { NormalizedTrack } from "../../../types.js";
import { isTrackSearchFallbackMatch, scoreSearchCandidate } from "../confidence.js";

/** Synthetic identity controls, not additional live catalog observations. */
describe("shared recording identity boundaries", () => {
  it.each([
    { artist: "Earth", candidate: "Earth, Wind & Fire" },
    { artist: "Earth, Wind & Fire", candidate: "Earth" },
  ])("does not equate $artist with $candidate through lookup fragments", ({ artist, candidate }) => {
    const query = { title: "September", artist, artists: [artist] };
    const track: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "synthetic",
      title: query.title,
      artists: [candidate],
      webUrl: "",
    };
    expect(isTrackSearchFallbackMatch(query, track)).toBe(false);
    expect(scoreSearchCandidate(query, track, 0)).toBe(0);
  });

  it("retains a complete band name inside an explicit featuring credit", () => {
    const query = {
      title: "September",
      artist: "Earth, Wind & Fire ft. Guest",
      artists: ["Earth, Wind & Fire ft. Guest"],
    };
    const track: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "synthetic",
      title: query.title,
      artists: ["Earth, Wind & Fire"],
      webUrl: "",
    };
    expect(scoreSearchCandidate(query, track, 0)).toBeGreaterThanOrEqual(0.6);
  });

  it.each([
    "Drumless Edition",
    "Daft Punk Remix",
    "Madison Square Garden Live",
  ])("rejects a different %s performance", (version) => {
    const query = { title: "Give Life Back to Music", artist: "Daft Punk", artists: ["Daft Punk"] };
    const track: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "synthetic",
      title: `${query.title} (${version})`,
      artists: query.artists,
      webUrl: "",
    };
    expect(scoreSearchCandidate(query, track, 0)).toBe(0);
  });

  it("does not classify a featured performer's name as a live version", () => {
    const query = { title: "Give Life Back to Music", artist: "Daft Punk", artists: ["Daft Punk"] };
    const track: NormalizedTrack = {
      sourceService: "spotify",
      sourceId: "synthetic",
      title: `${query.title} (feat. Live)`,
      artists: ["Daft Punk", "Live"],
      webUrl: "",
    };
    expect(scoreSearchCandidate(query, track, 0)).toBeGreaterThanOrEqual(0.6);
  });
});

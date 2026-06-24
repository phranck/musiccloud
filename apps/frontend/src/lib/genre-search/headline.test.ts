import { describe, expect, it } from "vitest";
import enMessages from "@/i18n/translations/en.json";
import { buildHeadline, type QueryDetails, type TFunc } from "@/lib/genre-search/headline";

/**
 * Builds a `t` stub backed by the real English message catalogue, replicating
 * the app's `{var}` interpolation, so the headline assertions read against the
 * actual wording (not a synthetic echo).
 */
function makeT(messages: Record<string, string>): TFunc {
  return (key, vars) => {
    let value = messages[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, replacement);
      }
    }
    return value;
  };
}

const t = makeT(enMessages as Record<string, string>);

/** Convenience builder so each case only spells out the fields it varies. */
function query(partial: Partial<QueryDetails>): QueryDetails {
  return { genres: ["jazz"], vibe: "hot", tracks: null, albums: null, artists: null, ...partial };
}

describe("buildHeadline", () => {
  it("renders the hot vibe as 'N tracks in <genre>'", () => {
    expect(buildHeadline(query({ vibe: "hot", tracks: 10 }), t, "en")).toBe("10 tracks in jazz");
  });

  it("renders the mixed vibe with the trailing 'mixed selection' clause", () => {
    expect(buildHeadline(query({ vibe: "mixed", tracks: 20, albums: 10, genres: ["jazz", "rock"] }), t, "en")).toBe(
      "20 tracks and 10 albums in jazz or rock — a mixed selection",
    );
  });

  it("collapses equal per-type counts to the all-types phrase", () => {
    expect(buildHeadline(query({ tracks: 5, albums: 5, artists: 5 }), t, "en")).toBe(
      "5 tracks, albums and artists in jazz",
    );
  });

  it("keeps genre names lowercase for non-German locales", () => {
    expect(buildHeadline(query({ tracks: 3, genres: ["Jazz"] }), t, "en")).toBe("3 tracks in jazz");
  });

  it("title-cases genre names for German", () => {
    // The German catalogue is not needed here — only the genre casing differs by
    // locale, and the count/connector words come from the (English) stub. The
    // assertion targets the casing of the genre token alone.
    expect(buildHeadline(query({ tracks: 3, genres: ["jazz"] }), t, "de")).toBe("3 tracks in Jazz");
  });
});

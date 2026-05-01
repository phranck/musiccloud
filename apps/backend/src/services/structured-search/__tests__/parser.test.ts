import { describe, expect, it } from "vitest";

import {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
} from "../parser.js";

describe("isStructuredSearchQuery", () => {
  it("matches title: prefix", () => {
    expect(isStructuredSearchQuery("title: Bohemian Rhapsody")).toBe(true);
  });
  it("matches artist: prefix", () => {
    expect(isStructuredSearchQuery("artist: Radiohead")).toBe(true);
  });
  it("matches album: prefix", () => {
    expect(isStructuredSearchQuery("album: OK Computer")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(isStructuredSearchQuery("TITLE: foo")).toBe(true);
    expect(isStructuredSearchQuery("Artist: foo")).toBe(true);
  });
  it("does not match free text", () => {
    expect(isStructuredSearchQuery("bohemian rhapsody")).toBe(false);
  });
  it("does not match genre:", () => {
    expect(isStructuredSearchQuery("genre: jazz")).toBe(false);
  });
  it("does not match URL", () => {
    expect(isStructuredSearchQuery("https://open.spotify.com/track/abc")).toBe(false);
  });
  it("does not match count: alone", () => {
    expect(isStructuredSearchQuery("count: 5")).toBe(false);
  });
});

describe("parseStructuredSearchQuery — happy path", () => {
  it("parses title + artist", () => {
    const r = parseStructuredSearchQuery("title: Karma Police, artist: Radiohead");
    expect(r.search).toEqual({ title: "Karma Police", artist: "Radiohead" });
    expect(r.candidateLimit).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });
  it("parses title + artist + album + count", () => {
    const r = parseStructuredSearchQuery(
      "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
    );
    expect(r.search).toEqual({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });
    expect(r.candidateLimit).toBe(5);
  });
  it("parses title alone", () => {
    const r = parseStructuredSearchQuery("title: Bohemian Rhapsody");
    expect(r.search).toEqual({ title: "Bohemian Rhapsody", artist: "" });
  });
  it("parses artist alone", () => {
    const r = parseStructuredSearchQuery("artist: Radiohead");
    expect(r.search).toEqual({ title: "", artist: "Radiohead" });
  });
  it("preserves value case but lowercases keys", () => {
    const r = parseStructuredSearchQuery("Title: Bohemian Rhapsody, ARTIST: Queen");
    expect(r.search.title).toBe("Bohemian Rhapsody");
    expect(r.search.artist).toBe("Queen");
  });
  it("collapses whitespace around : and ,", () => {
    const r = parseStructuredSearchQuery("  title  :   foo  ,  artist  :  bar  ");
    expect(r.search).toEqual({ title: "foo", artist: "bar" });
  });
  it("auto-inserts missing comma between fields", () => {
    const r = parseStructuredSearchQuery("title: foo artist: bar");
    expect(r.search).toEqual({ title: "foo", artist: "bar" });
  });
  it("accepts ampersand and special chars in values", () => {
    const r = parseStructuredSearchQuery("artist: Echo & The Bunnymen");
    expect(r.search.artist).toBe("Echo & The Bunnymen");
  });
});

describe("parseStructuredSearchQuery — error path", () => {
  it("rejects empty input", () => {
    expect(() => parseStructuredSearchQuery("")).toThrow(StructuredSearchQueryParseError);
  });
  it("rejects album: alone", () => {
    expect(() => parseStructuredSearchQuery("album: OK Computer")).toThrow(
      /at least one of: title, artist/,
    );
  });
  it("rejects count: alone", () => {
    expect(() => parseStructuredSearchQuery("count: 5")).toThrow(/at least one of: title, artist/);
  });
  it("rejects unknown key", () => {
    expect(() => parseStructuredSearchQuery("title: foo, foo: bar")).toThrow(
      /Unknown field 'foo'\. Allowed: title, artist, album, count/,
    );
  });
  it("rejects 'tracks' with directive message pointing to genre:", () => {
    expect(() => parseStructuredSearchQuery("title: foo, tracks: 5")).toThrow(
      /'tracks' is only valid in genre: queries\. Allowed here: title, artist, album, count/,
    );
  });
  it("rejects 'vibe' with directive message", () => {
    expect(() => parseStructuredSearchQuery("title: foo, vibe: hot")).toThrow(
      /'vibe' is only valid in genre: queries/,
    );
  });
  it("rejects 'genre' as a key inside structured search", () => {
    expect(() => parseStructuredSearchQuery("title: foo, genre: rock")).toThrow(
      /'genre' is only valid in genre: queries/,
    );
  });
  it("rejects duplicate keys", () => {
    expect(() => parseStructuredSearchQuery("title: foo, title: bar")).toThrow(
      /Duplicate field 'title'/,
    );
  });
  it("rejects empty value", () => {
    expect(() => parseStructuredSearchQuery("title: , artist: foo")).toThrow(
      /Missing value for 'title'/,
    );
  });
  it("rejects count below 1", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: 0")).toThrow(
      /'count' must be at least 1/,
    );
  });
  it("rejects count above 10", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: 11")).toThrow(
      /'count' must be at most 10/,
    );
  });
  it("rejects non-numeric count", () => {
    expect(() => parseStructuredSearchQuery("title: foo, count: abc")).toThrow(
      /'count' must be a positive integer/,
    );
  });
  it("rejects segment without colon", () => {
    expect(() => parseStructuredSearchQuery("title: foo, garbage")).toThrow(
      /Expected 'key: value'/,
    );
  });
});

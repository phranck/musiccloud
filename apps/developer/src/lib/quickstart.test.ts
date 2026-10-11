import { ENDPOINTS } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { API_KEY_ENV_NAME, API_KEY_HEADER, firstRequestSnippets, keylessNote, PUBLIC_API_BASE_URL } from "./quickstart";

describe("firstRequestSnippets", () => {
  it("builds every URL from the shared endpoint table rather than a copy of it", () => {
    for (const snippet of firstRequestSnippets()) {
      expect(snippet.code, snippet.id).toContain(`${PUBLIC_API_BASE_URL}${ENDPOINTS.v1.resolve}`);
    }
  });

  it("calls the endpoint that actually needs the key", () => {
    // The GET form of the same path answers without a credential, so a
    // quickstart built on it would succeed whether the key worked or not.
    for (const snippet of firstRequestSnippets()) {
      expect(snippet.code, snippet.id).toMatch(/POST|method: "POST"/);
    }
  });

  it("sends the one body field the resolve operation accepts", () => {
    // The operation takes `query` or `selectedCandidate` and refuses anything
    // else with a 400, before the key is even looked at.
    for (const snippet of firstRequestSnippets()) {
      const json = snippet.code.match(/\{"[^}]*\}/)?.[0];

      expect(json, snippet.id).toBeDefined();
      expect(Object.keys(JSON.parse(json ?? "{}")), snippet.id).toEqual(["query"]);
    }
  });

  it("names the header the key is sent in", () => {
    for (const snippet of firstRequestSnippets()) {
      expect(snippet.code, snippet.id).toContain(API_KEY_HEADER);
    }
  });

  it("reads the key from the environment instead of carrying it", () => {
    for (const snippet of firstRequestSnippets()) {
      expect(snippet.code, snippet.id).toContain(API_KEY_ENV_NAME);
      expect(snippet.code, snippet.id).not.toContain("mc_live_");
    }
  });

  it("always offers the plain HTTP form", () => {
    expect(firstRequestSnippets().map((snippet) => snippet.id)).toContain("curl");
  });
});

describe("keylessNote", () => {
  it("names the keyless endpoint and both of its limits", () => {
    const note = keylessNote();

    expect(note.url).toBe(`${PUBLIC_API_BASE_URL}${ENDPOINTS.v1.resolve}`);
    expect(note.text).toContain("10 requests a minute");
    expect(note.text).toContain("500 a day");
  });
});

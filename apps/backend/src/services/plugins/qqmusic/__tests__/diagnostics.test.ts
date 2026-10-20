import { afterEach, describe, expect, it, vi } from "vitest";
import { qqmusicAdapter } from "../adapter";

afterEach(() => vi.restoreAllMocks());

describe("QQ Music: refusal diagnostics", () => {
  it.each([
    { code: "test-only-private-detail" },
    { code: 0, "music.search.SearchCgiService": { code: "test-only-private-detail" } },
  ])("does not expose nonnumeric response code text (%j)", async (body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(body));
    await expect(qqmusicAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk" })).rejects.not.toThrow(
      "test-only-private-detail",
    );
  });
});

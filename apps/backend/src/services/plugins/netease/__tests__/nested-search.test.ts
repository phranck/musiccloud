import { afterEach, describe, expect, it, vi } from "vitest";
import { neteaseAdapter } from "../adapter";

afterEach(() => vi.restoreAllMocks());

for (const control of [
  {
    name: "tracks",
    count: "songCount",
    run: () => neteaseAdapter.searchTrack({ title: "Get Lucky", artist: "Daft Punk" }),
  },
  {
    name: "albums",
    count: "albumCount",
    run: () => neteaseAdapter.searchAlbum?.({ title: "Random Access Memories", artist: "Daft Punk" }),
  },
  { name: "artists", count: "artistCount", run: () => neteaseAdapter.searchArtist?.({ name: "Daft Punk" }) },
]) {
  const collection = control.name === "tracks" ? "songs" : control.name;
  describe(`NetEase: ${control.name} result envelope`, () => {
    it("rejects a recognized success code without the requested collection or zero count", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ code: 200, result: {} }));
      await expect(control.run()).rejects.toThrow();
    });
    it("does not accept a malformed present collection despite a zero count", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        Response.json({ code: 200, result: { [control.count]: 0, [collection]: {} } }),
      );
      await expect(control.run()).rejects.toThrow();
    });
    it("accepts the provider's omitted-list zero-count convention", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ code: 200, result: { [control.count]: 0 } }));
      await expect(control.run()).resolves.toMatchObject({ found: false });
    });
    it("accepts an explicit empty collection", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ code: 200, result: { [collection]: [] } }));
      await expect(control.run()).resolves.toMatchObject({ found: false });
    });
    it("does not expose arbitrary provider code text in diagnostics", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ code: "test-only-private-detail" }));
      await expect(control.run()).rejects.not.toThrow("test-only-private-detail");
    });
  });
}

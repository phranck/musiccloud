import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { findShortIdsByTrackUrls } from "./postgres-tracks.js";

describe("findShortIdsByTrackUrls", () => {
  it("resolves unique track URLs in one typed query", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { source_url: "https://deezer.test/track/1", short_id: "one" },
        { source_url: "https://deezer.test/track/2", short_id: "two" },
      ],
    });
    const pool = { query } as unknown as Pool;

    const shortIds = await findShortIdsByTrackUrls(pool, [
      "https://deezer.test/track/1",
      "https://deezer.test/track/2",
      "https://deezer.test/track/1",
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("t.source_url = ANY($1::text[])"), [
      ["https://deezer.test/track/1", "https://deezer.test/track/2"],
    ]);
    expect(shortIds).toEqual(
      new Map([
        ["https://deezer.test/track/1", "one"],
        ["https://deezer.test/track/2", "two"],
      ]),
    );
  });

  it("does not query when no usable URLs were supplied", async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pool;

    await expect(findShortIdsByTrackUrls(pool, [])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});

import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PostgresAdapter } from "../postgres.js";

const pool = new Pool({ connectionString: "postgres://unused:unused@127.0.0.1:1/not-a-database" });
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await pool.end();
});

describe("recording artwork compare-and-set storage", () => {
  it.each([
    "track",
    "album",
  ] as const)("updates only the observed %s cover through one parameterized statement", async (kind) => {
    const query = vi.spyOn(pool, "query").mockResolvedValue({
      command: "UPDATE",
      rowCount: 1,
      rows: [{ id: "fixture-id" }],
      oid: 0,
      fields: [],
    });
    const repository = new PostgresAdapter(pool);
    expect(repository).toHaveProperty("replaceRecordingArtwork", expect.any(Function));

    const changed = await repository.replaceRecordingArtwork(kind, "fixture-id", null, "https://example.com/cover.jpg");

    expect(changed).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE id = \$1 AND artwork_url IS NOT DISTINCT FROM \$2/),
      ["fixture-id", null, "https://example.com/cover.jpg", expect.any(Date)],
    );
  });
});

import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateShortId } from "../../../lib/short-id.js";
import { mintShortUrl } from "../short-url.js";

vi.mock("../../../lib/short-id.js", () => ({
  generateShortId: vi.fn(),
}));

const generateShortIdMock = vi.mocked(generateShortId);

/**
 * Stands in for one short-url table, enforcing the two unique rules the real
 * schema enforces: `id` is the primary key, and the entity-referencing column
 * carries a unique index.
 *
 * Both rules matter, because `ON CONFLICT DO NOTHING` names no target and so
 * absorbs either of them. Modelling only the primary key would let a broken
 * implementation pass.
 */
class FakeShortUrlTable {
  private readonly entityById = new Map<string, string>();
  private readonly idByEntity = new Map<string, string>();

  /** Runs before each simulated insert, to stage a concurrent write. */
  onBeforeInsert: (() => void) | null = null;

  /** Number of insert statements the table has received. */
  insertCount = 0;

  seed(id: string, entityId: string): void {
    this.entityById.set(id, entityId);
    this.idByEntity.set(entityId, id);
  }

  storedIdFor(entityId: string): string | undefined {
    return this.idByEntity.get(entityId);
  }

  asClient(): PoolClient {
    return { query: (sql: string, params: unknown[]) => this.query(sql, params) } as unknown as PoolClient;
  }

  private query(sql: string, params: unknown[]): { rows: Array<{ id: string }> } {
    if (sql.includes("SELECT id FROM")) {
      const entityId = params[0] as string;
      const id = this.idByEntity.get(entityId);
      return { rows: id === undefined ? [] : [{ id }] };
    }

    this.onBeforeInsert?.();
    this.insertCount += 1;
    const [id, entityId] = params as [string, string];
    if (this.entityById.has(id) || this.idByEntity.has(entityId)) return { rows: [] };
    this.seed(id, entityId);
    return { rows: [{ id }] };
  }
}

describe("mintShortUrl", () => {
  beforeEach(() => {
    generateShortIdMock.mockReset();
  });

  it("returns the id the entity already owns without inserting again", async () => {
    const table = new FakeShortUrlTable();
    table.seed("existing", "track-a");

    const result = await mintShortUrl(table.asClient(), "short_urls", "track-a", new Date());

    expect(result).toBe("existing");
    expect(table.insertCount).toBe(0);
    expect(generateShortIdMock).not.toHaveBeenCalled();
  });

  it("allocates a fresh id for an entity that has none", async () => {
    const table = new FakeShortUrlTable();
    generateShortIdMock.mockReturnValueOnce("brand-new");

    const result = await mintShortUrl(table.asClient(), "short_urls", "track-a", new Date());

    expect(result).toBe("brand-new");
    expect(table.storedIdFor("track-a")).toBe("brand-new");
  });

  it("never hands out an id that belongs to a different entity", async () => {
    const table = new FakeShortUrlTable();
    table.seed("taken", "track-a");
    generateShortIdMock.mockReturnValueOnce("taken").mockReturnValueOnce("free");

    const result = await mintShortUrl(table.asClient(), "short_urls", "track-b", new Date());

    // The regression this guards: returning the rejected candidate produced a
    // share URL that resolved to track-a.
    expect(result).not.toBe("taken");
    expect(result).toBe("free");
    expect(table.storedIdFor("track-b")).toBe("free");
    expect(table.storedIdFor("track-a")).toBe("taken");
  });

  it("keeps retrying while candidates collide", async () => {
    const table = new FakeShortUrlTable();
    table.seed("one", "other-1");
    table.seed("two", "other-2");
    generateShortIdMock.mockReturnValueOnce("one").mockReturnValueOnce("two").mockReturnValueOnce("three");

    const result = await mintShortUrl(table.asClient(), "album_short_urls", "album-a", new Date());

    expect(result).toBe("three");
    expect(table.insertCount).toBe(3);
  });

  it("returns the id a concurrent transaction claimed for the same entity", async () => {
    const table = new FakeShortUrlTable();
    generateShortIdMock.mockReturnValue("mine");
    table.onBeforeInsert = () => {
      table.onBeforeInsert = null;
      table.seed("theirs", "artist-a");
    };

    const result = await mintShortUrl(table.asClient(), "artist_short_urls", "artist-a", new Date());

    expect(result).toBe("theirs");
    expect(table.insertCount).toBe(1);
  });

  it("fails loudly rather than returning an unallocated id", async () => {
    const table = new FakeShortUrlTable();
    table.seed("always", "someone-else");
    generateShortIdMock.mockReturnValue("always");

    await expect(mintShortUrl(table.asClient(), "cc_short_urls", "cc-track-a", new Date())).rejects.toThrow(
      /Could not allocate a short id in cc_short_urls/,
    );
    expect(table.storedIdFor("cc-track-a")).toBeUndefined();
  });
});

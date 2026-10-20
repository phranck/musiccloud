import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateShortId } from "../../../lib/short-id.js";
import { findCanonicalShortId, mintShortUrl } from "../short-url.js";

vi.mock("../../../lib/short-id.js", () => ({
  generateShortId: vi.fn(),
}));

const generateShortIdMock = vi.mocked(generateShortId);

/**
 * Stands in for the six short-url tables, enforcing the rules the real schema
 * enforces in each: `id` is the primary key, and the entity-referencing column
 * carries a unique index.
 *
 * Both rules matter, because `ON CONFLICT DO NOTHING` names no target and so
 * absorbs either of them. Modelling only the primary key would let a broken
 * implementation pass. The tables are separate, as they are in the database,
 * so an id held by one is not refused by another's constraints.
 */
class FakeShortUrlTables {
  private readonly tables = new Map<string, { entityById: Map<string, string>; idByEntity: Map<string, string> }>();

  /** Runs before each simulated insert, to stage a concurrent write. */
  onBeforeInsert: (() => void) | null = null;

  /** Number of insert statements the tables have received. */
  insertCount = 0;

  /** Every statement in the order it arrived, to check what runs before what. */
  readonly statements: string[] = [];

  private table(name: string) {
    let table = this.tables.get(name);
    if (!table) {
      table = { entityById: new Map(), idByEntity: new Map() };
      this.tables.set(name, table);
    }
    return table;
  }

  seed(tableName: string, id: string, entityId: string): void {
    const table = this.table(tableName);
    table.entityById.set(id, entityId);
    table.idByEntity.set(entityId, id);
  }

  storedIdFor(tableName: string, entityId: string): string | undefined {
    return this.table(tableName).idByEntity.get(entityId);
  }

  asClient(): PoolClient {
    return { query: (sql: string, params: unknown[]) => this.query(sql, params) } as unknown as PoolClient;
  }

  private query(sql: string, params: unknown[]): { rows: Array<Record<string, unknown>> } {
    this.statements.push(sql);
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };

    if (sql.includes("UNION ALL")) {
      const candidate = params[0] as string;
      const held = [...this.tables.values()].some((table) => table.entityById.has(candidate));
      return { rows: held ? [{ "?column?": 1 }] : [] };
    }

    const tableName = /(?:FROM|INTO) (\w+)/.exec(sql)?.[1] ?? "";
    const table = this.table(tableName);

    if (sql.startsWith("SELECT id FROM")) {
      const id = table.idByEntity.get(params[0] as string);
      return { rows: id === undefined ? [] : [{ id }] };
    }

    this.onBeforeInsert?.();
    this.insertCount += 1;
    const [id, entityId] = params as [string, string];
    if (table.entityById.has(id) || table.idByEntity.has(entityId)) return { rows: [] };
    this.seed(tableName, id, entityId);
    return { rows: [{ id }] };
  }
}

describe("mintShortUrl", () => {
  beforeEach(() => {
    generateShortIdMock.mockReset();
  });

  it("returns the id the entity already owns without inserting again", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("short_urls", "existing", "track-a");

    const result = await mintShortUrl(tables.asClient(), "short_urls", "track-a", new Date());

    expect(result).toBe("existing");
    expect(tables.insertCount).toBe(0);
    expect(generateShortIdMock).not.toHaveBeenCalled();
  });

  it("allocates a fresh id for an entity that has none", async () => {
    const tables = new FakeShortUrlTables();
    generateShortIdMock.mockReturnValueOnce("brand-new");

    const result = await mintShortUrl(tables.asClient(), "short_urls", "track-a", new Date());

    expect(result).toBe("brand-new");
    expect(tables.storedIdFor("short_urls", "track-a")).toBe("brand-new");
  });

  it("never hands out an id that belongs to a different entity", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("short_urls", "taken", "track-a");
    generateShortIdMock.mockReturnValueOnce("taken").mockReturnValueOnce("free");

    const result = await mintShortUrl(tables.asClient(), "short_urls", "track-b", new Date());

    // The regression this guards: returning the rejected candidate produced a
    // share URL that resolved to track-a.
    expect(result).not.toBe("taken");
    expect(result).toBe("free");
    expect(tables.storedIdFor("short_urls", "track-b")).toBe("free");
    expect(tables.storedIdFor("short_urls", "track-a")).toBe("taken");
  });

  it("never hands out an id another table already holds, because the share route reads all of them", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("short_urls", "shared", "track-a");
    generateShortIdMock.mockReturnValueOnce("shared").mockReturnValueOnce("album-own");

    const result = await mintShortUrl(tables.asClient(), "album_short_urls", "album-a", new Date());

    expect(result).toBe("album-own");
    expect(tables.storedIdFor("album_short_urls", "album-a")).toBe("album-own");
  });

  it("locks each candidate before it checks and writes it", async () => {
    const tables = new FakeShortUrlTables();
    generateShortIdMock.mockReturnValueOnce("brand-new");

    await mintShortUrl(tables.asClient(), "cc_short_urls", "cc-track-a", new Date());

    const lock = tables.statements.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const check = tables.statements.findIndex((sql) => sql.includes("UNION ALL"));
    const insert = tables.statements.findIndex((sql) => sql.startsWith("INSERT"));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(check);
    expect(check).toBeLessThan(insert);
  });

  it("keeps retrying while candidates collide", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("album_short_urls", "one", "other-1");
    tables.seed("artist_short_urls", "two", "other-2");
    generateShortIdMock.mockReturnValueOnce("one").mockReturnValueOnce("two").mockReturnValueOnce("three");

    const result = await mintShortUrl(tables.asClient(), "album_short_urls", "album-a", new Date());

    expect(result).toBe("three");
    expect(tables.insertCount).toBe(1);
  });

  it("returns the id a concurrent transaction claimed for the same entity", async () => {
    const tables = new FakeShortUrlTables();
    generateShortIdMock.mockReturnValue("mine");
    tables.onBeforeInsert = () => {
      tables.onBeforeInsert = null;
      tables.seed("artist_short_urls", "theirs", "artist-a");
    };

    const result = await mintShortUrl(tables.asClient(), "artist_short_urls", "artist-a", new Date());

    expect(result).toBe("theirs");
    expect(tables.insertCount).toBe(1);
  });

  it("fails loudly rather than returning an unallocated id", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("short_urls", "always", "someone-else");
    generateShortIdMock.mockReturnValue("always");

    await expect(mintShortUrl(tables.asClient(), "cc_short_urls", "cc-track-a", new Date())).rejects.toThrow(
      /Could not allocate a short id in cc_short_urls/,
    );
    expect(tables.storedIdFor("cc_short_urls", "cc-track-a")).toBeUndefined();
  });

  it("never hands out an id that an alias holds, because the share route also answers aliases", async () => {
    const tables = new FakeShortUrlTables();
    tables.seed("track_short_url_aliases", "legacy", "track-a");
    generateShortIdMock.mockReturnValueOnce("legacy").mockReturnValueOnce("fresh");

    const result = await mintShortUrl(tables.asClient(), "short_urls", "track-b", new Date());

    expect(result).toBe("fresh");
    const check = tables.statements.find((sql) => sql.includes("UNION ALL")) ?? "";
    expect(check).toContain("FROM track_short_url_aliases");
    expect(check).toContain("FROM album_short_url_aliases");
  });
});

describe("findCanonicalShortId", () => {
  /** A queryable that knows one alias and records the statements it receives. */
  function queryableWithAlias(alias: string, canonical: string) {
    const statements: string[] = [];
    const queryable = {
      query: async (sql: string, params: unknown[]) => {
        statements.push(sql);
        return { rows: params[0] === alias ? [{ id: canonical }] : [] };
      },
    } as unknown as Pick<PoolClient, "query">;
    return { queryable, statements };
  }

  it("joins the alias to the canonical table of its entity kind and returns the canonical id", async () => {
    const { queryable, statements } = queryableWithAlias("legacy", "canonical");

    expect(await findCanonicalShortId(queryable, "track_short_url_aliases", "legacy")).toBe("canonical");
    expect(statements[0]).toMatch(
      /FROM track_short_url_aliases AS alias\s+JOIN short_urls AS canonical ON canonical\.track_id = alias\.track_id/,
    );
  });

  it("uses the album tables for an album alias", async () => {
    const { queryable, statements } = queryableWithAlias("legacy", "canonical");

    await findCanonicalShortId(queryable, "album_short_url_aliases", "legacy");

    expect(statements[0]).toMatch(
      /FROM album_short_url_aliases AS alias\s+JOIN album_short_urls AS canonical ON canonical\.album_id = alias\.album_id/,
    );
  });

  it("answers null for an id that is no alias", async () => {
    const { queryable } = queryableWithAlias("legacy", "canonical");

    expect(await findCanonicalShortId(queryable, "track_short_url_aliases", "unknown")).toBeNull();
  });
});

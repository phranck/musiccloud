import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { FakePool, constructedPools } = vi.hoisted(() => {
  const pools: InstanceType<typeof Pool>[] = [];

  class Pool {
    readonly options: Record<string, unknown>;
    readonly listeners = new Map<string, unknown>();
    readonly query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    readonly end = vi.fn(async () => undefined);

    constructor(options: Record<string, unknown>) {
      this.options = options;
      pools.push(this);
    }

    on(event: string, listener: unknown): this {
      this.listeners.set(event, listener);
      return this;
    }
  }

  return { FakePool: Pool, constructedPools: pools };
});

vi.mock("pg", () => ({ default: { Pool: FakePool }, Pool: FakePool }));
vi.mock("./config.js", () => ({ loadDatabaseConfig: () => ({ url: "postgres://runtime-test" }) }));

import { getArtwork } from "../services/genre-artwork/repository.js";
import { getAlbumImages } from "../services/image-cache.js";
import { getSetting } from "../services/site-settings.js";
import { readPluginStatesFromDb } from "./plugin-repository.js";
import { closeDatabasePool, createDatabasePool, DATABASE_STATEMENT_TIMEOUT_MS, getDatabasePool } from "./pool.js";

beforeEach(async () => {
  await closeDatabasePool();
  constructedPools.length = 0;
});

afterEach(async () => {
  await closeDatabasePool();
});

describe("createDatabasePool", () => {
  it("bounds every statement and every connection attempt", () => {
    createDatabasePool("postgres://runtime-test", 2);

    expect(constructedPools[0]?.options).toMatchObject({
      connectionString: "postgres://runtime-test",
      max: 2,
      statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
      connectionTimeoutMillis: expect.any(Number),
      idleTimeoutMillis: expect.any(Number),
    });
  });

  it("handles errors of idle clients instead of leaving them unhandled", () => {
    createDatabasePool("postgres://runtime-test", 2);

    expect(constructedPools[0]?.listeners.has("error")).toBe(true);
  });
});

describe("getDatabasePool", () => {
  it("serves plugin states, image cache, site settings and genre artwork from one pool", async () => {
    await readPluginStatesFromDb();
    await getAlbumImages([{ artist: "Slowdive", title: "Souvlaki" }]);
    await getSetting("tracking_enabled");
    await getArtwork("shoegaze");

    expect(constructedPools).toHaveLength(1);
    expect(constructedPools[0]?.query).toHaveBeenCalledTimes(4);
  });

  it("creates a new pool after the shared one was closed", async () => {
    const first = getDatabasePool();
    await closeDatabasePool();
    const second = getDatabasePool();

    expect(second).not.toBe(first);
    expect(constructedPools[0]?.end).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import { getRepository } from "../db/index.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the
 * `crawl_state` SQL added in migration 0023: lock acquire / release with
 * stale-detection, completeCrawlTick state transitions, and auto-disable
 * after consecutive_errors crosses threshold.
 *
 * Each test seeds its own random source-id so tests do not interfere with
 * each other or with real registry sources. Cleanup is best-effort
 * (the repository has no `deleteCrawlState` method); rows are tagged with
 * an `it-` prefix so seed runs in a real env can filter them out.
 */
describe.skipIf(!process.env.DATABASE_URL)("crawl-state repository (integration)", () => {
  function freshSourceId(): string {
    return `it-${Math.random().toString(36).slice(2, 12)}`;
  }

  async function seed(source: string): Promise<void> {
    const repo = await getRepository();
    await repo.seedCrawlState({
      source,
      displayName: `Integration ${source}`,
      defaultEnabled: true,
      defaultIntervalMinutes: 1,
      defaultConfig: {},
    });
  }

  it("acquireCrawlLock succeeds when running_since IS NULL", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();

    expect(await repo.acquireCrawlLock(sid, 30 * 60 * 1000)).toBe(true);
  });

  it("acquireCrawlLock fails when held and not stale", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();

    expect(await repo.acquireCrawlLock(sid, 30 * 60 * 1000)).toBe(true);
    expect(await repo.acquireCrawlLock(sid, 30 * 60 * 1000)).toBe(false);
  });

  it("acquireCrawlLock succeeds when held but stale (maxRunMs window already elapsed)", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();

    expect(await repo.acquireCrawlLock(sid, 30 * 60 * 1000)).toBe(true);
    // maxRunMs = 0 means "any non-NULL running_since older than 0ms is stale" — i.e. always stale
    expect(await repo.acquireCrawlLock(sid, 0)).toBe(true);
  });

  it("completeCrawlTick on success clears running_since, sets last_run_at, resets consecutive_errors", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();
    await repo.acquireCrawlLock(sid, 30 * 60 * 1000);

    const future = new Date(Date.now() + 60_000);
    await repo.completeCrawlTick(sid, { cursor: { page: 1 }, nextRunAt: future, success: true });

    const state = await repo.findCrawlState(sid);
    expect(state).not.toBeNull();
    expect(state?.runningSince).toBeNull();
    expect(state?.lastRunAt).toBeInstanceOf(Date);
    expect(state?.consecutiveErrors).toBe(0);
    expect(state?.lastError).toBeNull();
  });

  it("completeCrawlTick on error increments consecutive_errors and stores last_error", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();
    await repo.acquireCrawlLock(sid, 30 * 60 * 1000);

    await repo.completeCrawlTick(sid, {
      cursor: null,
      nextRunAt: new Date(Date.now() + 60_000),
      success: false,
      errorMessage: "boom",
    });

    const state = await repo.findCrawlState(sid);
    expect(state?.consecutiveErrors).toBe(1);
    expect(state?.lastError).toBe("boom");
    expect(state?.errorCount).toBe(1);
  });

  it("auto-disables source when consecutive_errors crosses the default threshold (5)", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();

    for (let i = 0; i < 5; i++) {
      await repo.acquireCrawlLock(sid, 30 * 60 * 1000);
      await repo.completeCrawlTick(sid, {
        cursor: null,
        nextRunAt: new Date(Date.now() + 60_000),
        success: false,
        errorMessage: `err-${i}`,
      });
    }

    const state = await repo.findCrawlState(sid);
    expect(state?.consecutiveErrors).toBeGreaterThanOrEqual(5);
    expect(state?.enabled).toBe(false);
  });

  it("listDueCrawlState filters by enabled + next_run_at + running_since", async () => {
    const sid = freshSourceId();
    await seed(sid);
    const repo = await getRepository();

    // Default seed has next_run_at = NOW(); should be due immediately.
    const due = await repo.listDueCrawlState();
    expect(due.some((r) => r.source === sid)).toBe(true);

    // Push next_run_at one hour out → should drop out.
    await repo.updateCrawlState(sid, { nextRunAt: new Date(Date.now() + 60 * 60 * 1000) });
    const dueAfter = await repo.listDueCrawlState();
    expect(dueAfter.some((r) => r.source === sid)).toBe(false);
  });
});

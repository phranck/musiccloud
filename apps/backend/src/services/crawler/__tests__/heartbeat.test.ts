import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlStateRecord, TrackRepository } from "../../../db/repository.js";
import { type CrawlerSource, CrawlerSourceConfigurationError } from "../types.js";

const mockRepo = {
  seedCrawlState: vi.fn(),
  listDueCrawlState: vi.fn(),
  acquireCrawlLock: vi.fn(),
  insertCrawlRun: vi.fn(),
  finalizeCrawlRun: vi.fn(),
  completeCrawlTick: vi.fn(),
};

vi.mock("../../../db/index.js", () => ({
  getRepository: vi.fn(async () => mockRepo as unknown as TrackRepository),
}));

vi.mock("../dedupe.js", () => ({
  isAlreadyIngested: vi.fn(),
}));

vi.mock("../ingest.js", () => ({
  ingestCandidate: vi.fn(),
}));

const parseConfigMock = vi.fn((config: unknown) => config as Record<string, unknown>);
const assertAvailableMock = vi.fn();

const mockSource: CrawlerSource = {
  id: "test-source",
  displayName: "Test Source",
  defaultIntervalMinutes: 360,
  defaultEnabled: true,
  defaultConfig: {},
  parseConfig: parseConfigMock,
  assertAvailable: assertAvailableMock,
  fetch: vi.fn(),
};

vi.mock("../registry.js", () => ({
  listCrawlerSources: () => [mockSource],
  getCrawlerSource: (id: string) => (id === "test-source" ? mockSource : null),
}));

import { isAlreadyIngested } from "../dedupe.js";
import { runHeartbeat } from "../heartbeat.js";
import { ingestCandidate } from "../ingest.js";

const baseStateRow: CrawlStateRecord = {
  source: "test-source",
  displayName: "Test Source",
  enabled: true,
  intervalMinutes: 360,
  nextRunAt: new Date(),
  lastRunAt: null,
  cursor: null,
  config: {},
  runningSince: null,
  errorCount: 0,
  lastError: null,
  consecutiveErrors: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.seedCrawlState.mockResolvedValue(undefined);
  mockRepo.listDueCrawlState.mockResolvedValue([]);
  mockRepo.acquireCrawlLock.mockResolvedValue(true);
  mockRepo.insertCrawlRun.mockResolvedValue(undefined);
  mockRepo.finalizeCrawlRun.mockResolvedValue(undefined);
  mockRepo.completeCrawlTick.mockResolvedValue(undefined);
  vi.mocked(isAlreadyIngested).mockResolvedValue(false);
  vi.mocked(ingestCandidate).mockResolvedValue("ingested");
  parseConfigMock.mockReset();
  parseConfigMock.mockImplementation((config: unknown) => config as Record<string, unknown>);
  assertAvailableMock.mockReset();
  (mockSource.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ candidates: [], nextCursor: null });
});

describe("runHeartbeat: seeding", () => {
  it("upserts every registry-known source on each tick", async () => {
    await runHeartbeat();

    expect(mockRepo.seedCrawlState).toHaveBeenCalledWith({
      source: "test-source",
      displayName: "Test Source",
      defaultEnabled: true,
      defaultIntervalMinutes: 360,
      defaultConfig: {},
    });
  });
});

describe("runHeartbeat: idle case", () => {
  it("does not touch lock or fetch when no sources are due", async () => {
    await runHeartbeat();

    expect(mockRepo.acquireCrawlLock).not.toHaveBeenCalled();
    expect(mockSource.fetch).not.toHaveBeenCalled();
    expect(mockRepo.insertCrawlRun).not.toHaveBeenCalled();
  });
});

describe("runHeartbeat: lock contention", () => {
  it("skips a due source when another tick still holds the lock", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    mockRepo.acquireCrawlLock.mockResolvedValueOnce(false);

    await runHeartbeat();

    expect(mockRepo.acquireCrawlLock).toHaveBeenCalledWith("test-source", 30 * 60 * 1000);
    expect(mockSource.fetch).not.toHaveBeenCalled();
    expect(mockRepo.insertCrawlRun).not.toHaveBeenCalled();
    expect(mockRepo.completeCrawlTick).not.toHaveBeenCalled();
  });
});

describe("runHeartbeat: successful tick", () => {
  it("flows fetch -> dedupe -> ingest -> finalize -> completeTick with correct counters", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    (mockSource.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      candidates: [
        { kind: "url", url: "https://x/1" },
        { kind: "url", url: "https://x/2" },
      ],
      nextCursor: { page: 2 },
    });
    vi.mocked(isAlreadyIngested).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(ingestCandidate).mockResolvedValueOnce("ingested");

    await runHeartbeat();

    expect(mockSource.fetch).toHaveBeenCalledWith({}, null);
    expect(mockRepo.insertCrawlRun).toHaveBeenCalledWith(
      expect.objectContaining({ source: "test-source", status: "running" }),
    );
    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    expect(mockRepo.finalizeCrawlRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "success", discovered: 2, ingested: 1, skipped: 1, errors: 0 }),
    );
    expect(mockRepo.completeCrawlTick).toHaveBeenCalledWith(
      "test-source",
      expect.objectContaining({ cursor: { page: 2 }, success: true }),
    );
  });

  it("counts ingest failures into the errors counter without crashing the tick", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    (mockSource.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      candidates: [{ kind: "url", url: "https://x/1" }],
      nextCursor: null,
    });
    vi.mocked(ingestCandidate).mockResolvedValueOnce("error");

    await runHeartbeat();

    expect(mockRepo.finalizeCrawlRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "success", errors: 1, ingested: 0 }),
    );
    // A per-candidate error does NOT make the whole tick fail.
    expect(mockRepo.completeCrawlTick).toHaveBeenCalledWith("test-source", expect.objectContaining({ success: true }));
  });

  it("includes source-level malformed or duplicate drops in discovered and skipped counters", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    (mockSource.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      candidates: [{ kind: "search", title: "Track", artist: "Artist" }],
      skipped: 2,
      nextCursor: null,
    });

    await runHeartbeat();

    expect(mockRepo.finalizeCrawlRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "success", discovered: 3, ingested: 1, skipped: 2, errors: 0 }),
    );
  });
});

describe("runHeartbeat: source-fetch failure", () => {
  it("turns source configuration or availability failures into a normal failed run", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    parseConfigMock.mockImplementationOnce(() => {
      throw new CrawlerSourceConfigurationError("Crawler source configuration is incomplete.");
    });

    await runHeartbeat();

    expect(mockSource.fetch).not.toHaveBeenCalled();
    expect(mockRepo.finalizeCrawlRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "error", notes: "Crawler source configuration is incomplete." }),
    );
    expect(mockRepo.completeCrawlTick).toHaveBeenCalledWith(
      "test-source",
      expect.objectContaining({ success: false, errorMessage: "Crawler source configuration is incomplete." }),
    );
  });

  it("records crawl_runs.status=error and propagates errorMessage to completeCrawlTick", async () => {
    mockRepo.listDueCrawlState.mockResolvedValueOnce([baseStateRow]);
    (mockSource.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Deezer 503"));

    await runHeartbeat();

    expect(mockRepo.finalizeCrawlRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "error", notes: "Deezer 503" }),
    );
    expect(mockRepo.completeCrawlTick).toHaveBeenCalledWith(
      "test-source",
      expect.objectContaining({ success: false, errorMessage: "Deezer 503" }),
    );
  });
});

describe("runHeartbeat: orphan source rows", () => {
  it("ignores due rows whose source id is not in the registry (deploy artifact)", async () => {
    const orphanRow: CrawlStateRecord = { ...baseStateRow, source: "old-source" };
    mockRepo.listDueCrawlState.mockResolvedValueOnce([orphanRow]);

    await runHeartbeat();

    expect(mockRepo.acquireCrawlLock).not.toHaveBeenCalled();
    expect(mockRepo.insertCrawlRun).not.toHaveBeenCalled();
  });
});

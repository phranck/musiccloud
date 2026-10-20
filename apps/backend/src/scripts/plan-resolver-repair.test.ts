import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type PlanConnection, type PlanRuntime, runPlanCommand } from "./plan-resolver-repair.js";
import { ARCHIVE_HASH, MemoryRowStore, MIGRATION_HASH } from "./resolver-repair/__tests__/memory-row-store.js";
import { verifyManifest } from "./resolver-repair/engine.js";
import { parseManifest, type RowValues } from "./resolver-repair/manifest.js";
import { REPAIRABLE_TABLES } from "./resolver-repair/repairable-tables.js";

const COPY = "musiccloud_snapshot_20261021000000_abcdef";
const COPY_URL = `postgresql://dev:secret@localhost:5433/${COPY}`;

const track: RowValues = {
  id: "t1",
  title: "Child In Time - Live (1970)",
  duration_ms: 576000,
  source_service: "youtube",
  source_url: "https://www.youtube.com/watch?v=source",
  album_name: null,
};
const credit: RowValues = { id: "t1-credit-0", track_id: "t1", credit_name: "Deep Purple", credit_position: 0 };
const deezerLink: RowValues = {
  id: "t1-deezer",
  track_id: "t1",
  service: "deezer",
  external_id: "3122917",
  url: "https://www.deezer.com/track/3122917",
  confidence: 0.7090909,
  match_method: "search",
  created_at: "2026-08-20T15:17:21.825+00:00",
};
const deezerObservation: RowValues = {
  id: "t1-isrc-deezer-GBDXG0600116",
  track_id: "t1",
  id_type: "isrc",
  id_value: "GBDXG0600116",
  source_service: "deezer",
  observed_at: "2026-08-20T15:17:21.825+00:00",
};
const data: Record<string, RowValues[]> = {
  tracks: [track],
  track_artist_credits: [credit],
  service_links: [deezerLink],
  track_external_ids: [deezerObservation],
};

/** Private directories this test owns: the snapshot description and the place the plan goes. */
async function fixture(overrides: { database?: string; mode?: number } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "musiccloud-plan-768-"));
  const snapshot = path.join(directory, "snapshot");
  await mkdir(snapshot, { mode: overrides.mode ?? 0o700 });
  await writeFile(path.join(snapshot, "dump-manifest.json"), JSON.stringify({ sha256: ARCHIVE_HASH }), { mode: 0o600 });
  await writeFile(
    path.join(snapshot, "restore-verification.json"),
    JSON.stringify({ database: overrides.database ?? COPY, tableCountsMatch: true, migrationsMatch: true }),
    { mode: 0o600 },
  );
  return {
    directory,
    snapshot,
    output: path.join(directory, "plan"),
    argv: (extra: string[] = []) => [
      "recording-links",
      "--snapshot-dir",
      snapshot,
      "--target-env",
      "REPAIR_DATABASE_URL",
      "--out-dir",
      path.join(directory, "plan"),
      "--track-id",
      "t1",
      ...extra,
    ],
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

/** A runtime over fixed rows whose provider answers with the given duration. */
function runtimeFor(durationMs: number, url = COPY_URL) {
  const calls = { connected: 0, closed: 0 };
  const connection: PlanConnection = {
    readIdentity: async () => ({ database: COPY, role: "dev", superuser: true, recovery: false }),
    read: async (work) => work(async (sql) => data[/FROM (\w+)/.exec(sql)?.[1] ?? ""] ?? [], MIGRATION_HASH),
    close: async () => {
      calls.closed++;
    },
  };
  const runtime: PlanRuntime = {
    environment: { REPAIR_DATABASE_URL: url },
    connect: async () => {
      calls.connected++;
      return connection;
    },
    ports: {
      fetchTrack: async () => ({
        sourceService: "deezer",
        sourceId: "3122917",
        title: "Child in Time (Live)",
        artists: ["Deep Purple"],
        durationMs,
        webUrl: "https://www.deezer.com/track/3122917",
      }),
    },
  };
  return { runtime, calls };
}

async function codeOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "ok";
  } catch (error) {
    return error !== null && typeof error === "object" && "code" in error
      ? String(error.code)
      : `unexpected ${String(error)}`;
  }
}

describe("planning from a restored copy", () => {
  it("publishes a private plan whose manifest the runner recognizes against the same rows", async () => {
    const files = await fixture();
    try {
      const { runtime } = runtimeFor(627000);
      const outcome = await runPlanCommand(files.argv(), runtime);
      expect(outcome).toMatchObject({ repair: "recording-links", operations: 2 });

      expect((await stat(files.output)).mode & 0o777).toBe(0o700);
      for (const name of ["manifest.json", "manifest.json.sha256", "plan-evidence.json", "plan.json"])
        expect((await stat(path.join(files.output, name))).mode & 0o777).toBe(0o600);

      const content = await readFile(path.join(files.output, "manifest.json"), "utf8");
      const manifest = parseManifest(content, outcome.manifestSha256, REPAIRABLE_TABLES);
      const store = new MemoryRowStore([
        { table: "service_links", keyColumn: "id", row: deezerLink },
        { table: "track_external_ids", keyColumn: "id", row: deezerObservation },
      ]);
      expect(await verifyManifest(store, manifest, MIGRATION_HASH)).toMatchObject({ total: 2, before: 2, conflict: 0 });
      expect(await readFile(path.join(files.output, "plan-evidence.json"), "utf8")).not.toContain("secret");
    } finally {
      await files.cleanup();
    }
  });

  it("publishes nothing when every destination is compatible", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = runtimeFor(576000);
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_EMPTY");
      expect(calls.closed).toBe(1);
      await expect(stat(files.output)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await files.cleanup();
    }
  });

  it("reads only a restored copy and never production", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = runtimeFor(627000, "postgresql://db:secret@postgresql.zerops:5432/db");
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_TARGET_NOT_A_COPY");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("refuses a copy that the snapshot directory does not describe", async () => {
    const files = await fixture({ database: "musiccloud_snapshot_20260101000000_000000" });
    try {
      const { runtime, calls } = runtimeFor(627000);
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_SNAPSHOT_MISMATCH");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("refuses a snapshot directory that other users can enter", async () => {
    const files = await fixture();
    try {
      await chmod(files.snapshot, 0o755);
      const { runtime } = runtimeFor(627000);
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_PRIVATE_PATH_REQUIRED");
    } finally {
      await files.cleanup();
    }
  });

  it("refuses an output that exists or lies inside a Git checkout", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = runtimeFor(627000);
      await mkdir(files.output, { mode: 0o700 });
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_OUTPUT_INVALID");
      await rm(files.output, { recursive: true });
      await mkdir(path.join(files.directory, ".git"), { mode: 0o700 });
      expect(await codeOf(runPlanCommand(files.argv(), runtime))).toBe("PLAN_OUTPUT_INVALID");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("knows only the registered repairs and needs its options", async () => {
    const files = await fixture();
    try {
      const { runtime } = runtimeFor(627000);
      expect(await codeOf(runPlanCommand(["truncate", ...files.argv().slice(1)], runtime))).toBe("PLAN_UNKNOWN_REPAIR");
      expect(await codeOf(runPlanCommand(["recording-links", "--target-env", "REPAIR_DATABASE_URL"], runtime))).toBe(
        "PLAN_OPTION_INVALID",
      );
      expect(
        await codeOf(
          runPlanCommand(
            files.argv().filter((word) => word !== "--track-id" && word !== "t1"),
            runtime,
          ),
        ),
      ).toBe("PLAN_OPTION_INVALID");
    } finally {
      await files.cleanup();
    }
  });
});

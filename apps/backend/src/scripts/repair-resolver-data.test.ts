import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type RepairConnection,
  type RepairRuntime,
  type RunnerRevision,
  runRepairCommand,
} from "./repair-resolver-data.js";
import { MemoryRowStore, MIGRATION_HASH, manifestOf } from "./resolver-repair/__tests__/memory-row-store.js";
import type { RowStore } from "./resolver-repair/engine.js";
import { type RepairOperation, sealManifest } from "./resolver-repair/manifest.js";
import { REPAIRABLE_TABLES } from "./resolver-repair/repairable-tables.js";
import type { TargetIdentity } from "./resolver-repair/target.js";

const COPY = "musiccloud_repair_20261021000000_abcdef";
const COPY_URL = `postgresql://dev:secret@localhost:5433/${COPY}`;
const PRODUCTION_URL = "postgresql://db:secret@postgresql.zerops:5432/db?sslmode=disable";

const operations: RepairOperation[] = [
  {
    kind: "update-columns",
    table: "tracks",
    keyColumn: "id",
    keyValue: "t1",
    before: { artwork_url: "https://i.ytimg.com/vi/fixture/hq.jpg" },
    after: { artwork_url: null },
  },
  {
    kind: "delete-row",
    table: "service_links",
    keyColumn: "id",
    keyValue: "t1-deezer",
    row: { id: "t1-deezer", track_id: "t1", service: "deezer" },
  },
];

/** The rows the manifest expects to find. */
function liveStore(): MemoryRowStore {
  return new MemoryRowStore([
    {
      table: "tracks",
      keyColumn: "id",
      row: { id: "t1", artwork_url: "https://i.ytimg.com/vi/fixture/hq.jpg", title: "T" },
    },
    { table: "service_links", keyColumn: "id", row: { id: "t1-deezer", track_id: "t1", service: "deezer" } },
  ]);
}

/** A manifest file with its checksum file, in a private directory this test owns. */
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "musiccloud-repair-775-"));
  const manifest = path.join(directory, "manifest.json");
  const { content, sha256 } = sealManifest(manifestOf(operations), REPAIRABLE_TABLES);
  await writeFile(manifest, content, { mode: 0o600 });
  await writeFile(`${manifest}.sha256`, `${sha256}  manifest.json\n`, { mode: 0o600 });
  return {
    directory,
    manifest,
    sha256,
    report: path.join(directory, "report.json"),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

/** A connection over memory that records how often it was opened and closed. */
function memoryRuntime(
  store: MemoryRowStore,
  url: string,
  identity: Partial<TargetIdentity> = {},
  revision: RunnerRevision = { commit: "c".repeat(40), clean: true },
) {
  const calls = { connected: 0, closed: 0, modes: [] as string[] };
  const database = new URL(url).pathname.slice(1);
  const connection: RepairConnection = {
    readIdentity: async () => ({
      database,
      role: new URL(url).username,
      superuser: false,
      recovery: false,
      ...identity,
    }),
    run: async (mode, work) => {
      calls.modes.push(mode);
      return work(store as RowStore, MIGRATION_HASH);
    },
    close: async () => {
      calls.closed++;
    },
  };
  const runtime: RepairRuntime = {
    environment: { REPAIR_DATABASE_URL: url, DATABASE_URL: "postgresql://dev:secret@localhost:5433/musiccloud" },
    connect: async () => {
      calls.connected++;
      return connection;
    },
    revision: () => revision,
  };
  return { runtime, calls };
}

/** The failure code a command ends with, or `ok`. */
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

describe("verifying, applying and undoing on a rehearsal copy", () => {
  it("verifies without writing", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      const { runtime, calls } = memoryRuntime(store, COPY_URL);
      const outcome = await runRepairCommand(
        ["verify", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"],
        runtime,
      );
      expect(outcome).toMatchObject({
        status: "verified",
        manifestSha256: files.sha256,
        target: "rehearsal-copy",
        report: { total: 2, before: 2, after: 0, conflict: 0 },
      });
      expect(store.writes).toEqual([]);
      expect(calls).toMatchObject({ connected: 1, closed: 1, modes: ["read-only"] });
    } finally {
      await files.cleanup();
    }
  });

  it("applies, keeps a private report without row values, and a second run changes nothing", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      const { runtime } = memoryRuntime(store, COPY_URL);
      const argv = ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"];
      const first = await runRepairCommand([...argv, "--report", files.report], runtime);
      expect(first).toMatchObject({ status: "applied", written: 2, skipped: 0 });
      expect(store.snapshot()["tracks/t1"]).toMatchObject({ artwork_url: null });
      expect(store.snapshot()["service_links/t1-deezer"]).toBeUndefined();
      expect((await stat(files.report)).mode & 0o777).toBe(0o600);
      const report = await readFile(files.report, "utf8");
      expect(report).toContain(files.sha256);
      expect(report).not.toContain("ytimg.com");

      const second = await runRepairCommand(argv, runtime);
      expect(second).toMatchObject({ status: "applied", written: 0, skipped: 2 });
    } finally {
      await files.cleanup();
    }
  });

  it("restores the original rows on rollback", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      const original = store.snapshot();
      const { runtime } = memoryRuntime(store, COPY_URL);
      await runRepairCommand(["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"], runtime);
      const outcome = await runRepairCommand(
        ["rollback", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"],
        runtime,
      );
      expect(outcome.status).toBe("rolled-back");
      expect(store.snapshot()).toEqual(original);
    } finally {
      await files.cleanup();
    }
  });

  it("returns an abort and leaves the rows alone when one of them changed", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      store.tamper({ table: "tracks", keyValue: "t1" }, { artwork_url: "https://cdn.example.org/manual.jpg" });
      const before = store.snapshot();
      const { runtime } = memoryRuntime(store, COPY_URL);
      const outcome = await runRepairCommand(
        ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"],
        runtime,
      );
      expect(outcome).toMatchObject({ status: "aborted", abortCode: "REPAIR_THIRD_STATE", written: 0 });
      expect(outcome.report.conflicts).toEqual([{ index: 0, table: "tracks", keyValue: "t1" }]);
      expect(store.snapshot()).toEqual(before);
    } finally {
      await files.cleanup();
    }
  });

  it("reports a repair that is not in place after the commit instead of calling it applied", async () => {
    const files = await fixture();
    try {
      const writing = liveStore();
      const reading = liveStore();
      const split: RepairConnection = {
        readIdentity: async () => ({ database: COPY, role: "dev", superuser: false, recovery: false }),
        run: async (mode, work) => work((mode === "read-write" ? writing : reading) as RowStore, MIGRATION_HASH),
        close: async () => {},
      };
      const runtime: RepairRuntime = { environment: { REPAIR_DATABASE_URL: COPY_URL }, connect: async () => split };
      const outcome = await runRepairCommand(
        ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"],
        runtime,
      );
      expect(outcome).toMatchObject({ status: "aborted", abortCode: "REPAIR_POSTCOMMIT_MISMATCH", committed: true });
    } finally {
      await files.cleanup();
    }
  });
});

describe("refusing to start", () => {
  it("asks production writes for the manifest checksum as confirmation", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      const { runtime, calls } = memoryRuntime(store, PRODUCTION_URL);
      const argv = ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"];
      expect(await codeOf(runRepairCommand(argv, runtime))).toBe("REPAIR_CONFIRMATION_REQUIRED");
      expect(await codeOf(runRepairCommand([...argv, "--confirm", "0".repeat(64)], runtime))).toBe(
        "REPAIR_CONFIRMATION_REQUIRED",
      );
      expect(calls.connected).toBe(0);
      const outcome = await runRepairCommand([...argv, "--confirm", files.sha256], runtime);
      expect(outcome).toMatchObject({ status: "applied", target: "production" });
    } finally {
      await files.cleanup();
    }
  });

  it("records the revision the command ran from in its outcome and report", async () => {
    const files = await fixture();
    try {
      const { runtime } = memoryRuntime(liveStore(), COPY_URL);
      const outcome = await runRepairCommand(
        ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL", "--report", files.report],
        runtime,
      );
      expect(outcome.runner).toEqual({ commit: "c".repeat(40), clean: true });
      expect(JSON.parse(await readFile(files.report, "utf8")).runner).toEqual({ commit: "c".repeat(40), clean: true });
    } finally {
      await files.cleanup();
    }
  });

  it("refuses production writes from a checkout with uncommitted changes, but lets a rehearsal copy run", async () => {
    const files = await fixture();
    try {
      const dirty = { commit: "c".repeat(40), clean: false };
      const production = memoryRuntime(liveStore(), PRODUCTION_URL, {}, dirty);
      const argv = ["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"];
      expect(await codeOf(runRepairCommand([...argv, "--confirm", files.sha256], production.runtime))).toBe(
        "REPAIR_DIRTY_RUNNER",
      );
      expect(production.calls.connected).toBe(0);
      const verified = await runRepairCommand(["verify", ...argv.slice(1)], production.runtime);
      expect(verified).toMatchObject({ status: "verified", runner: dirty });
      const rehearsal = memoryRuntime(liveStore(), COPY_URL, {}, dirty);
      expect((await runRepairCommand(argv, rehearsal.runtime)).status).toBe("applied");
    } finally {
      await files.cleanup();
    }
  });

  it("needs no confirmation to verify on production", async () => {
    const files = await fixture();
    try {
      const { runtime } = memoryRuntime(liveStore(), PRODUCTION_URL);
      const outcome = await runRepairCommand(
        ["verify", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"],
        runtime,
      );
      expect(outcome.status).toBe("verified");
    } finally {
      await files.cleanup();
    }
  });

  it("stops at a production server that answers as a superuser, after closing the connection", async () => {
    const files = await fixture();
    try {
      const store = liveStore();
      const { runtime, calls } = memoryRuntime(store, PRODUCTION_URL, { superuser: true });
      const argv = [
        "apply",
        "--manifest",
        files.manifest,
        "--target-env",
        "REPAIR_DATABASE_URL",
        "--confirm",
        files.sha256,
      ];
      expect(await codeOf(runRepairCommand(argv, runtime))).toBe("REPAIR_TARGET_IDENTITY");
      expect(store.writes).toEqual([]);
      expect(calls.closed).toBe(1);
    } finally {
      await files.cleanup();
    }
  });

  it("never reads DATABASE_URL, whatever it holds", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = memoryRuntime(liveStore(), COPY_URL);
      expect(
        await codeOf(
          runRepairCommand(["verify", "--manifest", files.manifest, "--target-env", "DATABASE_URL"], runtime),
        ),
      ).toBe("REPAIR_CONFIG_REQUIRED");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("refuses the development database before connecting", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = memoryRuntime(liveStore(), "postgresql://dev:secret@localhost:5433/musiccloud");
      expect(
        await codeOf(
          runRepairCommand(["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"], runtime),
        ),
      ).toBe("REPAIR_TARGET_NOT_A_REPAIR_COPY");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("refuses a manifest whose content changed after it was sealed", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = memoryRuntime(liveStore(), COPY_URL);
      const content = await readFile(files.manifest, "utf8");
      await writeFile(files.manifest, content.replace("t1-deezer", "t9-deezer"), { mode: 0o600 });
      expect(
        await codeOf(
          runRepairCommand(["apply", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"], runtime),
        ),
      ).toBe("MANIFEST_CHECKSUM_MISMATCH");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("refuses a manifest that other users can read", async () => {
    const files = await fixture();
    try {
      const { runtime, calls } = memoryRuntime(liveStore(), COPY_URL);
      await chmod(files.manifest, 0o644);
      expect(
        await codeOf(
          runRepairCommand(["verify", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"], runtime),
        ),
      ).toBe("REPAIR_PRIVATE_PATH_REQUIRED");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("does not overwrite an earlier report", async () => {
    const files = await fixture();
    try {
      await writeFile(files.report, "earlier", { mode: 0o600 });
      const { runtime, calls } = memoryRuntime(liveStore(), COPY_URL);
      expect(
        await codeOf(
          runRepairCommand(
            ["verify", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL", "--report", files.report],
            runtime,
          ),
        ),
      ).toBe("REPAIR_REPORT_EXISTS");
      expect(await readFile(files.report, "utf8")).toBe("earlier");
      expect(calls.connected).toBe(0);
    } finally {
      await files.cleanup();
    }
  });

  it("needs a known mode, a manifest and a target variable", async () => {
    const files = await fixture();
    try {
      const { runtime } = memoryRuntime(liveStore(), COPY_URL);
      expect(
        await codeOf(
          runRepairCommand(["truncate", "--manifest", files.manifest, "--target-env", "REPAIR_DATABASE_URL"], runtime),
        ),
      ).toBe("REPAIR_CONFIG_REQUIRED");
      expect(await codeOf(runRepairCommand(["verify", "--target-env", "REPAIR_DATABASE_URL"], runtime))).toBe(
        "REPAIR_CONFIG_REQUIRED",
      );
      expect(await codeOf(runRepairCommand(["verify", "--manifest", files.manifest], runtime))).toBe(
        "REPAIR_CONFIG_REQUIRED",
      );
    } finally {
      await files.cleanup();
    }
  });
});

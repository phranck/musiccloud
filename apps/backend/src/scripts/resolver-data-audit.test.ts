import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAuditCapture } from "./audit-resolver-data.js";

const source = {
  archiveSha256: "a".repeat(64),
  snapshotAt: "2026-01-01T00:00:00.000Z",
  migrations: [{ id: 1, hash: "fixture-migration", created_at: "1234" }],
};
const tool = {
  revision: "b".repeat(40),
  tree: "c".repeat(40),
  sourceSha256: "d".repeat(64),
  lockfileSha256: "e".repeat(64),
};

/**
 * Supplies only synthetic catalog rows through the PostgreSQL system boundary.
 * @param name - Environment-specific connection identity, absent from portable content.
 * @param readOnly - Simulated server transaction setting.
 * @returns A connected database stand-in with no network or data-writing behavior.
 */
function fixtureDatabase(name = "snapshot_fixture", readOnly = "on") {
  return {
    async query(statement: string) {
      if (statement.includes("current_database"))
        return { rows: [{ database: name, role: "fixture", read_only: readOnly }] };
      if (statement.includes("drizzle.__drizzle_migrations")) return { rows: source.migrations };
      if (statement.includes("audit:artwork"))
        return {
          rows: [
            { table: "tracks", key: "youtube-cover", url: "https://i.ytimg.com/vi/fixture/hqdefault.jpg" },
            { table: "albums", key: "apple-cover", url: "https://is1-ssl.mzstatic.com/cover.jpg" },
            { table: "artist_profiles", key: "channel-portrait", url: "https://yt3.ggpht.com/portrait" },
            { table: "artist_profiles", key: "apple-portrait", url: "https://is2.mzstatic.com/portrait" },
            { table: "tracks", key: "allowed-cover", url: "https://cdn.example.org/cover.jpg" },
          ],
        };
      return { rows: [] };
    },
  };
}

import { captureResolverEvidence } from "./resolver-data-audit.js";

/**
 * Builds an owned archive/environment fixture without real credentials or records.
 * @returns Paths and cleanup for this test's exact temporary directory.
 */
async function captureFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "musiccloud-audit-765-"));
  const snapshot = path.join(directory, "snapshot");
  await mkdir(snapshot, { mode: 0o700 });
  const archive = Buffer.from("synthetic archive");
  const sha256 = createHash("sha256").update(archive).digest("hex");
  await writeFile(path.join(snapshot, "production.dump"), archive, { mode: 0o600 });
  await writeFile(
    path.join(snapshot, "dump-manifest.json"),
    JSON.stringify({ sha256, startedAt: source.snapshotAt, migrations: source.migrations }),
    { mode: 0o600 },
  );
  await writeFile(
    path.join(snapshot, "restore-verification.json"),
    JSON.stringify({
      database: "musiccloud_snapshot_20260101000000_abcdef",
      identity: { role: "fixture" },
      tableCountsMatch: true,
      migrationsMatch: true,
      developmentCountsUnchanged: true,
    }),
    { mode: 0o600 },
  );
  const environment = path.join(directory, "local.env");
  await writeFile(
    environment,
    'DATABASE_URL=postgresql://fixture:synthetic-password@127.0.0.1:5433/development\nPRIVATE_KEY="line one\\nline two"\n',
    { mode: 0o600 },
  );
  const output = path.join(directory, "evidence");
  return {
    directory,
    snapshot,
    environment,
    output,
    argv: ["--snapshot-dir", snapshot, "--env-file", environment, "--out-dir", output],
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

/**
 * Simulates only external process/driver boundaries; all artifact handling stays real.
 * @param port - Published local container port.
 * @returns Runtime ports and a connection-state probe with no live connections.
 */
function captureRuntime(port = "5433") {
  let connected = false;
  const commands: string[] = [];
  return {
    commands,
    execute(command: string, arguments_: string[]) {
      commands.push(command);
      if (command.endsWith("docker"))
        return JSON.stringify({ running: true, ports: { "5432/tcp": [{ HostPort: port }] } });
      if (arguments_.includes("status")) return "";
      if (arguments_.includes("--git-common-dir")) return path.join(tmpdir(), "audit-fixture-repo", ".git");
      return "b".repeat(40);
    },
    createClient() {
      return {
        ...fixtureDatabase("musiccloud_snapshot_20260101000000_abcdef"),
        async connect() {
          connected = true;
        },
        async end() {},
      };
    },
    connected: () => connected,
  };
}

describe("local audit capture entry point", () => {
  it("publishes only a complete private artifact with byte-verifiable provenance", async () => {
    const fixture = await captureFixture();
    try {
      const bundle = await runAuditCapture(fixture.argv, captureRuntime());
      expect(bundle.content).toContain('"formatVersion":1');
      const evidence = await readFile(path.join(fixture.output, "evidence.json"), "utf8");
      expect(evidence).toBe(bundle.content);
      expect(createHash("sha256").update(evidence).digest("hex")).toBe(bundle.sha256);
      expect(await readFile(path.join(fixture.output, "evidence.sha256"), "utf8")).toBe(
        `${bundle.sha256}  evidence.json\n`,
      );
      const receipt = JSON.parse(await readFile(path.join(fixture.output, "capture.json"), "utf8"));
      expect(receipt.complete).toBe(true);
      expect(receipt.evidenceSha256).toBe(bundle.sha256);
      expect(evidence + JSON.stringify(receipt)).not.toContain("synthetic-password");
      expect(evidence).not.toContain("musiccloud_snapshot_20260101000000_abcdef");
      expect((await stat(fixture.output)).mode & 0o777).toBe(0o700);
      for (const name of ["evidence.json", "evidence.sha256", "capture.json"])
        expect((await stat(path.join(fixture.output, name))).mode & 0o777).toBe(0o600);
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses URL options that could override the validated local connection", async () => {
    const fixture = await captureFixture();
    try {
      await writeFile(
        fixture.environment,
        "DATABASE_URL=postgresql://fixture:synthetic-password@127.0.0.1:5433/development?host=production.invalid\n",
      );
      await expect(runAuditCapture(fixture.argv, captureRuntime())).rejects.toThrow("AUDIT_CONNECTION_OPTIONS");
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses an archive whose bytes no longer match the source manifest", async () => {
    const fixture = await captureFixture();
    try {
      await writeFile(path.join(fixture.snapshot, "production.dump"), "changed archive bytes");
      await expect(runAuditCapture(fixture.argv, captureRuntime())).rejects.toThrow("AUDIT_ARCHIVE_MISMATCH");
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses a dirty tool checkout because it cannot pin the executing revision", async () => {
    const fixture = await captureFixture();
    try {
      const runtime = captureRuntime();
      const execute = runtime.execute;
      runtime.execute = (command, arguments_) =>
        arguments_.includes("status") ? " M fixture.ts" : execute(command, arguments_);
      await expect(runAuditCapture(fixture.argv, runtime)).rejects.toThrow("AUDIT_DIRTY_TOOL");
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses publicly readable snapshot artifacts", async () => {
    const fixture = await captureFixture();
    try {
      await chmod(fixture.snapshot, 0o755);
      await expect(runAuditCapture(fixture.argv, captureRuntime())).rejects.toThrow("AUDIT_PRIVATE_PATH_REQUIRED");
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses remote credentials before opening a connection", async () => {
    const fixture = await captureFixture();
    try {
      await writeFile(
        fixture.environment,
        "DATABASE_URL=postgresql://fixture:synthetic-password@production.invalid/db\n",
      );
      const runtime = captureRuntime();
      await expect(runAuditCapture(fixture.argv, runtime)).rejects.toThrow("AUDIT_LOCAL_TARGET_REQUIRED");
      expect(runtime.connected()).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("refuses a local listener that does not match the existing musiccloud container", async () => {
    const fixture = await captureFixture();
    try {
      const runtime = captureRuntime("5432");
      await expect(runAuditCapture(fixture.argv, runtime)).rejects.toThrow("AUDIT_CONTAINER_IDENTITY");
      expect(runtime.connected()).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("asks the runtime on the search path for the container, whichever product provides it", async () => {
    const fixture = await captureFixture();
    try {
      const runtime = captureRuntime();
      await runAuditCapture(fixture.argv, runtime);
      expect(runtime.commands.filter((command) => command.endsWith("docker"))).toEqual(["docker"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it.each([
    {
      failure: Object.assign(new Error("spawnSync docker ENOENT"), { code: "ENOENT" }),
      code: "AUDIT_CONTAINER_RUNTIME_MISSING",
    },
    { failure: new Error("Command failed: docker inspect musiccloud"), code: "AUDIT_CONTAINER_IDENTITY" },
  ])("ends with $code when the container runtime cannot report the container", async ({ failure, code }) => {
    const fixture = await captureFixture();
    try {
      const runtime = captureRuntime();
      const execute = runtime.execute;
      runtime.execute = (command, arguments_) => {
        if (command === "docker") throw failure;
        return execute(command, arguments_);
      };
      await expect(runAuditCapture(fixture.argv, runtime)).rejects.toThrow(code);
      expect(runtime.connected()).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not overwrite a previously published evidence directory", async () => {
    const fixture = await captureFixture();
    try {
      await mkdir(fixture.output, { mode: 0o700 });
      await writeFile(path.join(fixture.output, "keep.txt"), "owned sentinel");
      const runtime = captureRuntime();
      await expect(runAuditCapture(fixture.argv, runtime)).rejects.toThrow("AUDIT_OUTPUT_EXISTS");
      expect(await readFile(path.join(fixture.output, "keep.txt"), "utf8")).toBe("owned sentinel");
      expect(runtime.connected()).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("portable resolver evidence", () => {
  it("rejects a writable transaction before reading catalog records", async () => {
    const database = {
      async query(statement: string) {
        if (statement.startsWith("BEGIN") || statement === "ROLLBACK") return { rows: [] };
        if (statement.includes("current_database")) {
          return { rows: [{ database: "snapshot_fixture", role: "fixture", read_only: "off" }] };
        }
        throw new Error("Catalog records must not be read outside the verified boundary");
      },
    };
    await expect(
      captureResolverEvidence(database, {
        expectedDatabase: "snapshot_fixture",
        expectedRole: "fixture",
        source,
        tool,
      }),
    ).rejects.toThrow("AUDIT_READ_ONLY_REQUIRED");
  });

  it.each([
    { change: { expectedDatabase: "another_database" }, code: "AUDIT_DATABASE_IDENTITY" },
    { change: { expectedRole: "another_role" }, code: "AUDIT_DATABASE_IDENTITY" },
    { change: { source: { ...source, migrations: [] } }, code: "AUDIT_MIGRATION_DRIFT" },
  ])("refuses an inconsistent capture prerequisite $code", async ({ change, code }) => {
    await expect(
      captureResolverEvidence(fixtureDatabase(), {
        expectedDatabase: "snapshot_fixture",
        expectedRole: "fixture",
        source,
        tool,
        ...change,
      }),
    ).rejects.toThrow(code);
  });

  it("does not expose a driver error or return partial evidence after a failed query", async () => {
    const database = fixtureDatabase();
    const query = database.query;
    database.query = async (statement) => {
      if (statement.includes("audit:artwork")) throw new Error("password=synthetic-sensitive-value");
      return query(statement);
    };
    await expect(
      captureResolverEvidence(database, {
        expectedDatabase: "snapshot_fixture",
        expectedRole: "fixture",
        source,
        tool,
      }),
    ).rejects.toThrow("AUDIT_QUERY_FAILED");
  });

  it("does not silently omit an explicitly requested reference identity", async () => {
    await expect(
      captureResolverEvidence(fixtureDatabase(), {
        expectedDatabase: "snapshot_fixture",
        expectedRole: "fixture",
        source,
        tool,
        referenceTrackIds: ["missing-reference"],
      }),
    ).rejects.toThrow("AUDIT_REFERENCE_MISSING");
  });

  it("seals the same stable ids and original values independently of the connection name", async () => {
    const local = await captureResolverEvidence(fixtureDatabase(), {
      expectedDatabase: "snapshot_fixture",
      expectedRole: "fixture",
      source,
      tool,
    });
    const other = await captureResolverEvidence(fixtureDatabase("another_fixture"), {
      expectedDatabase: "another_fixture",
      expectedRole: "fixture",
      source,
      tool,
    });
    expect(local.content).toBeTypeOf("string");
    expect(local.content).toBe(other.content);
    expect(local.sha256).toMatch(/^[a-f0-9]{64}$/);
    const manifest = JSON.parse(local.content);
    expect(manifest.source).toEqual(source);
    expect(manifest.tool).toMatchObject(tool);
    expect(manifest.findings.artwork.rows).toEqual([
      { key: "apple-cover", table: "albums", url: "https://is1-ssl.mzstatic.com/cover.jpg", policy: "apple_artwork" },
      {
        key: "apple-portrait",
        table: "artist_profiles",
        url: "https://is2.mzstatic.com/portrait",
        policy: "apple_artwork",
      },
      {
        key: "youtube-cover",
        table: "tracks",
        url: "https://i.ytimg.com/vi/fixture/hqdefault.jpg",
        policy: "youtube_recording_artwork",
      },
    ]);
    expect(local.content).not.toContain("another_fixture");
    expect(manifest.definitions.find((definition: { id: string }) => definition.id === "artwork").sql).toContain(
      "public.tracks",
    );
  });
});

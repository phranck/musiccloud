/** @file Local-only CLI for private, version-pinned resolver evidence. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { Client, type ClientConfig } from "pg";
import { DEVELOPMENT_DATABASE_SERVER, isDevelopmentDatabaseHost } from "../db/development-hosts.js";
import {
  type AuditBundle,
  type AuditDatabase,
  AuditFailure,
  type AuditSource,
  captureResolverEvidence,
} from "./resolver-data-audit.js";
import {
  fileSha256,
  isPrivateOwnedEntry,
  PrivatePublicationError,
  publishPrivateDirectory,
} from "./resolver-repair/private-files.js";

/** Driver boundary used by the local-only command; clients never become application pools. */
interface AuditClient extends AuditDatabase {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
}

/** Process and PostgreSQL ports permit tests without connecting to existing databases. */
export interface AuditRuntime {
  execute?(command: string, arguments_: string[]): string;
  createClient?(configuration: ClientConfig): AuditClient;
}

/** Every runtime rule file is hashed independently of its absolute checkout path. */
const RULE_FILES = [
  "apps/backend/src/scripts/audit-resolver-data.ts",
  "apps/backend/src/scripts/resolver-data-audit.ts",
  "apps/backend/src/scripts/resolver-repair/canonical-json.ts",
  "apps/backend/src/scripts/resolver-repair/stored-artwork-policy.ts",
  "apps/backend/src/services/artwork.ts",
  "apps/backend/src/services/constants.ts",
];

/**
 * Narrows parsed JSON without accepting arrays or null as metadata records.
 * @param value - Parsed input with no assumed schema.
 * @returns Whether property access can be validated explicitly.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Requires a private path owned by this user, without following a final symlink.
 * @param location - Existing artifact or protected directory.
 * @returns Its filesystem metadata after permission and ownership checks.
 */
async function requirePrivatePath(location: string) {
  const information = await lstat(location);
  if (!isPrivateOwnedEntry(information)) throw new AuditFailure("AUDIT_PRIVATE_PATH_REQUIRED");
  return information;
}

/**
 * Loads protected operational JSON without importing any environment values.
 * @param location - Existing private regular JSON file.
 * @returns An untrusted object whose required fields still need validation.
 */
async function readPrivateObject(location: string): Promise<Record<string, unknown>> {
  if (!(await requirePrivatePath(location)).isFile()) throw new AuditFailure("AUDIT_PRIVATE_PATH_REQUIRED");
  const value: unknown = JSON.parse(await readFile(location, "utf8"));
  if (!isRecord(value)) throw new AuditFailure("AUDIT_METADATA_INVALID");
  return value;
}

/**
 * Refuses an existing output before opening PostgreSQL and again during publication.
 * @param output - Planned new private artifact directory.
 */
async function requireAbsent(output: string): Promise<void> {
  try {
    await lstat(output);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new AuditFailure("AUDIT_OUTPUT_EXISTS");
}

/**
 * Publishes a completion receipt last; failed writes remove only this run's files.
 * @param output - New, private directory outside every checkout.
 * @param bundle - Complete read-only capture whose checksum covers exact bytes.
 * @param database - Verified local database name, kept out of portable selectors.
 */
async function publishBundle(output: string, bundle: AuditBundle, database: string): Promise<void> {
  const receipt = { complete: true, capturedAt: new Date().toISOString(), database, evidenceSha256: bundle.sha256 };
  try {
    await publishPrivateDirectory(output, [
      { name: "evidence.json", content: bundle.content },
      { name: "evidence.sha256", content: `${bundle.sha256}  evidence.json\n` },
      { name: "capture.json", content: `${JSON.stringify(receipt)}\n` },
    ]);
  } catch (error) {
    throw new AuditFailure(
      error instanceof PrivatePublicationError && !error.cleanedUp
        ? "AUDIT_OUTPUT_CLEANUP_FAILED"
        : "AUDIT_OUTPUT_FAILED",
    );
  }
}

const CONTAINER_NAME = "musiccloud";
const CONTAINER_INSPECT_FORMAT = '{"running":{{json .State.Running}},"ports":{{json .NetworkSettings.Ports}}}';

/**
 * The OrbStack `docker` on the development server, relative to the login directory. A non-interactive SSH session
 * does not have `~/.orbstack/bin` on its search path.
 */
const DEVELOPMENT_SERVER_DOCKER = ".orbstack/bin/docker";

/**
 * Reads the running state and published ports of the `musiccloud` container that the database URL points at.
 * On the machine running the code, the command is looked up on the search path, so Docker Desktop, OrbStack or any
 * other product that provides `docker` answers. For the development database server, the same command runs there over SSH.
 * @param execute - Process port that returns the standard output of a command.
 * @param hostname - The host of the database URL.
 * @returns The inspected container, still untrusted.
 * @throws {AuditFailure} `AUDIT_CONTAINER_RUNTIME_MISSING` when no `docker` or `ssh` executable exists, and `AUDIT_CONTAINER_IDENTITY` when the runtime cannot report the container.
 */
function inspectDevelopmentContainer(
  execute: (command: string, arguments_: string[]) => string,
  hostname: string,
): unknown {
  try {
    const inspect = ["inspect", "--format", CONTAINER_INSPECT_FORMAT, CONTAINER_NAME];
    if (hostname === DEVELOPMENT_DATABASE_SERVER) {
      // ssh passes one string to the remote shell, which would split the format on its quotes and braces.
      const remoteCommand = [
        DEVELOPMENT_SERVER_DOCKER,
        "inspect",
        "--format",
        `'${CONTAINER_INSPECT_FORMAT}'`,
        CONTAINER_NAME,
      ];
      return JSON.parse(execute("ssh", ["-o", "BatchMode=yes", DEVELOPMENT_DATABASE_SERVER, remoteCommand.join(" ")]));
    }
    return JSON.parse(execute("docker", inspect));
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    throw new AuditFailure(missing ? "AUDIT_CONTAINER_RUNTIME_MISSING" : "AUDIT_CONTAINER_IDENTITY");
  }
}

/**
 * Captures private resolver evidence from an explicitly selected local snapshot.
 * @param argv - Snapshot directory, local env file, new output and optional reference ids.
 * @param runtime - External process/driver ports; defaults use the installed local tools.
 * @returns Canonical evidence and safe summary counts. No database write mode exists.
 * @throws Safe operational failures or errors sanitized by the direct-entry boundary.
 */
export async function runAuditCapture(argv: string[], runtime: AuditRuntime = {}): Promise<AuditBundle> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "snapshot-dir": { type: "string" },
      "env-file": { type: "string" },
      "out-dir": { type: "string" },
      "reference-track": { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values["snapshot-dir"] || !values["env-file"] || !values["out-dir"])
    throw new AuditFailure("AUDIT_CONFIG_REQUIRED");
  const environment = parseEnv(await readFile(values["env-file"], "utf8"));
  if (!environment.DATABASE_URL) throw new AuditFailure("AUDIT_LOCAL_TARGET_REQUIRED");
  const url = new URL(environment.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !isDevelopmentDatabaseHost(url.hostname))
    throw new AuditFailure("AUDIT_LOCAL_TARGET_REQUIRED");
  if (url.hash || [...url.searchParams].some(([key, value]) => key !== "sslmode" || value !== "disable"))
    throw new AuditFailure("AUDIT_CONNECTION_OPTIONS");
  const outputParent = await realpath(path.dirname(path.resolve(values["out-dir"])));
  const output = path.join(outputParent, path.basename(values["out-dir"]));
  await requireAbsent(output);
  if (!(await requirePrivatePath(outputParent)).isDirectory()) throw new AuditFailure("AUDIT_PRIVATE_PATH_REQUIRED");
  const snapshot = path.resolve(values["snapshot-dir"]);
  if (!(await requirePrivatePath(snapshot)).isDirectory()) throw new AuditFailure("AUDIT_PRIVATE_PATH_REQUIRED");

  const execute =
    runtime.execute ??
    ((command: string, arguments_: string[]) =>
      execFileSync(command, arguments_, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const codeRoot = path.resolve(__dirname, "../../../..");
  const git = (...arguments_: string[]) => execute("git", ["-C", codeRoot, ...arguments_]).trim();
  if (git("status", "--porcelain", "--untracked-files=normal")) throw new AuditFailure("AUDIT_DIRTY_TOOL");
  const repositoryRoot = path.dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir"));
  for (const root of [repositoryRoot, codeRoot]) {
    const relative = path.relative(root, output);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
      throw new AuditFailure("AUDIT_OUTPUT_INSIDE_REPOSITORY");
  }
  const revision = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  if (![revision, tree].every((value) => /^[a-f0-9]{40}$/.test(value)))
    throw new AuditFailure("AUDIT_REVISION_INVALID");

  const manifest = await readPrivateObject(path.join(snapshot, "dump-manifest.json"));
  const verification = await readPrivateObject(path.join(snapshot, "restore-verification.json"));
  if (
    typeof manifest.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.startedAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.startedAt)) ||
    !Array.isArray(manifest.migrations) ||
    !manifest.migrations.every(isRecord)
  )
    throw new AuditFailure("AUDIT_METADATA_INVALID");
  if (
    typeof verification.database !== "string" ||
    !/^musiccloud_snapshot_\d{14}_[a-f0-9]{6}$/.test(verification.database) ||
    !isRecord(verification.identity) ||
    verification.identity.role !== decodeURIComponent(url.username) ||
    verification.tableCountsMatch !== true ||
    verification.migrationsMatch !== true ||
    verification.developmentCountsUnchanged !== true ||
    decodeURIComponent(url.pathname.slice(1)) === verification.database
  )
    throw new AuditFailure("AUDIT_RESTORE_NOT_VERIFIED");
  const archive = path.join(snapshot, "production.dump");
  const archiveInformation = await requirePrivatePath(archive);
  if (!archiveInformation.isFile() || archiveInformation.size === 0 || (await fileSha256(archive)) !== manifest.sha256)
    throw new AuditFailure("AUDIT_ARCHIVE_MISMATCH");
  const container = inspectDevelopmentContainer(execute, url.hostname);
  if (!isRecord(container) || container.running !== true || !isRecord(container.ports))
    throw new AuditFailure("AUDIT_CONTAINER_IDENTITY");
  const bindings = container.ports["5432/tcp"];
  if (
    !Array.isArray(bindings) ||
    !bindings.some((binding: unknown) => isRecord(binding) && binding.HostPort === (url.port || "5432"))
  )
    throw new AuditFailure("AUDIT_CONTAINER_IDENTITY");

  const sourceHash = createHash("sha256");
  for (const file of RULE_FILES)
    sourceHash
      .update(file)
      .update("\0")
      .update(await readFile(path.join(codeRoot, file)));
  const source: AuditSource = {
    archiveSha256: manifest.sha256,
    snapshotAt: manifest.startedAt,
    migrations: manifest.migrations,
  };
  const client = (runtime.createClient ?? ((configuration: ClientConfig) => new Client(configuration)))({
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port || "5432"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: verification.database,
    ssl: false,
    options: "-c default_transaction_read_only=on",
    statement_timeout: 30000,
    application_name: "musiccloud_resolver_evidence",
  });
  let bundle: AuditBundle;
  try {
    await client.connect();
    bundle = await captureResolverEvidence(client, {
      expectedDatabase: verification.database,
      expectedRole: String(verification.identity.role),
      source,
      referenceTrackIds: values["reference-track"],
      tool: {
        revision,
        tree,
        sourceSha256: sourceHash.digest("hex"),
        lockfileSha256: await fileSha256(path.join(codeRoot, "pnpm-lock.yaml")),
      },
    });
  } finally {
    await client.end();
  }
  await publishBundle(output, bundle, verification.database);
  return bundle;
}

if (typeof module !== "undefined" && typeof require !== "undefined" && module === require.main) {
  runAuditCapture(process.argv.slice(2))
    .then((bundle) => {
      console.log(JSON.stringify({ status: "captured", sha256: bundle.sha256, summary: bundle.summary }));
    })
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({
          status: "failed",
          code: error instanceof AuditFailure ? error.code : "AUDIT_CAPTURE_FAILED",
          errorId: randomUUID(),
        }),
      );
      process.exitCode = 1;
    });
}

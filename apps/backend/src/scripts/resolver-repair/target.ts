import type { ClientBase, ClientConfig } from "pg";

/** What a command does to the target. `apply` and `rollback` write. */
export type RepairMode = "verify" | "apply" | "rollback";

/**
 * Whether a command-line word names a mode.
 *
 * @param value - The first positional argument.
 * @returns True for `verify`, `apply` and `rollback`, which also narrows the type.
 */
export function isRepairMode(value: unknown): value is RepairMode {
  return value === "verify" || value === "apply" || value === "rollback";
}

/** The two places a repair may run: a restored copy on this machine, or the production database. */
export type RepairTargetKind = "rehearsal-copy" | "production";

/** Why the runner refused to start. None of these codes contains a connection value or a row. */
export type RepairFailureCode =
  | "REPAIR_CONFIG_REQUIRED"
  | "REPAIR_TARGET_INVALID"
  | "REPAIR_CONNECTION_OPTIONS"
  | "REPAIR_TARGET_NOT_A_REPAIR_COPY"
  | "REPAIR_TARGET_NOT_ALLOWED"
  | "REPAIR_TARGET_IDENTITY"
  | "REPAIR_CONFIRMATION_REQUIRED"
  | "REPAIR_DIRTY_RUNNER"
  | "REPAIR_PRIVATE_PATH_REQUIRED"
  | "REPAIR_REPORT_EXISTS";

/** The runner refused to start. The message is the static code. */
export class RepairFailure extends Error {
  /**
   * @param code - The reason, chosen by the runner and never taken from input.
   */
  constructor(readonly code: RepairFailureCode) {
    super(code);
    this.name = "RepairFailure";
  }
}

/** A target the runner accepted, with the connection settings to reach it. */
export interface RepairTarget {
  kind: RepairTargetKind;
  database: string;
  role: string;
  config: ClientConfig;
}

/** Who the server says the connection is. */
export interface TargetIdentity {
  database: string;
  role: string;
  superuser: boolean;
  recovery: boolean;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Hosts of the production database as the private network names it: the service name, with or without its zone, or
 * an address of the private 10.0.0.0/8 range. A public name never matches, so a mistyped URL cannot reach another server.
 */
const PRODUCTION_HOST_PATTERN = /^(postgresql(\.zerops)?|10(\.\d{1,3}){3})$/;

/** The application's own database and role on production, which `docs/postgres-migration-safety.md` names. */
const PRODUCTION_DATABASE_AND_ROLE = "db";

/** Names of the copies `snapshot.mjs` restores. Only a `repair` copy may be written, so an analysis snapshot stays untouched. */
const SNAPSHOT_COPY_PATTERN = /^musiccloud_(snapshot|repair)_\d{14}_[a-f0-9]{6}$/;
const REPAIR_COPY_PATTERN = /^musiccloud_repair_\d{14}_[a-f0-9]{6}$/;

/**
 * Decides, from the connection URL alone, whether a command may connect.
 *
 * A local URL must name a restored copy, never the development database, and only a `repair` copy may be written.
 * A remote URL must reach the production database `db` as the role `db`. The check runs before any connection exists.
 *
 * @param connectionUrl - The value of the target environment variable.
 * @param mode - What the command will do.
 * @returns The accepted target with its connection settings.
 * @throws {RepairFailure} For an unparseable URL, extra connection options, a local database that is not a suitable
 *   copy, or a remote host, database or role that is not production.
 */
export function resolveRepairTarget(connectionUrl: string, mode: RepairMode): RepairTarget {
  let url: URL;
  try {
    url = new URL(connectionUrl);
  } catch {
    throw new RepairFailure("REPAIR_TARGET_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new RepairFailure("REPAIR_TARGET_INVALID");
  if (url.hash || [...url.searchParams].some(([key, value]) => key !== "sslmode" || value !== "disable"))
    throw new RepairFailure("REPAIR_CONNECTION_OPTIONS");

  const database = decodeURIComponent(url.pathname.slice(1));
  const role = decodeURIComponent(url.username);
  const local = LOCAL_HOSTS.includes(url.hostname);
  let kind: RepairTargetKind;
  if (local) {
    const pattern = mode === "verify" ? SNAPSHOT_COPY_PATTERN : REPAIR_COPY_PATTERN;
    if (!pattern.test(database)) throw new RepairFailure("REPAIR_TARGET_NOT_A_REPAIR_COPY");
    kind = "rehearsal-copy";
  } else {
    if (
      !PRODUCTION_HOST_PATTERN.test(url.hostname) ||
      database !== PRODUCTION_DATABASE_AND_ROLE ||
      role !== PRODUCTION_DATABASE_AND_ROLE
    )
      throw new RepairFailure("REPAIR_TARGET_NOT_ALLOWED");
    kind = "production";
  }
  return {
    kind,
    database,
    role,
    config: {
      host: url.hostname === "[::1]" ? "::1" : url.hostname,
      port: Number(url.port || "5432"),
      user: role,
      password: decodeURIComponent(url.password),
      database,
      ssl: false,
      connectionTimeoutMillis: 10000,
      application_name: "musiccloud_resolver_repair",
    },
  };
}

/**
 * Reads who the server believes the connection is.
 *
 * @param client - A connected client.
 * @returns The database, role, superuser flag and recovery state.
 */
export async function readTargetIdentity(client: ClientBase): Promise<TargetIdentity> {
  const result = await client.query<TargetIdentity>(
    `SELECT current_database() AS database, current_user AS role,
            (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
            pg_is_in_recovery() AS recovery`,
  );
  return result.rows[0];
}

/**
 * Proves the server is the one the URL promised.
 * Production must answer as the non-superuser application role, which is how the migration runner refuses an
 * administrative connection as well. A standby never accepts a repair.
 *
 * @param target - The accepted target.
 * @param identity - What the server reported.
 * @throws {RepairFailure} With `REPAIR_TARGET_IDENTITY` on any deviation.
 */
export function assertTargetIdentity(target: RepairTarget, identity: TargetIdentity): void {
  if (
    identity.database !== target.database ||
    identity.role !== target.role ||
    identity.recovery ||
    (target.kind === "production" && identity.superuser)
  )
    throw new RepairFailure("REPAIR_TARGET_IDENTITY");
}

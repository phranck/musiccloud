/**
 * @file The connection pool every runtime database read and write goes through.
 *
 * One pool serves the repository adapter and the small modules that query the
 * database directly (plugin states, image cache, site settings, genre
 * artwork). A separate pool per module would idle out on its own schedule, so
 * a sporadic read such as the plugin-state refresh would open a fresh
 * connection while the requests waiting on it stand still. Sharing the pool
 * means such a read finds a connection the resolve traffic keeps warm.
 *
 * The migration runner keeps its own pool on purpose: a migration may run for
 * longer than {@link DATABASE_STATEMENT_TIMEOUT_MS}.
 */

import * as pgModule from "pg";
import { log } from "../lib/infra/logger.js";
import { loadDatabaseConfig } from "./config.js";

/**
 * Upper bound for any single statement, enforced by the server. The heaviest
 * statements the application runs, the admin bulk updates and deletes over
 * `tracks` and `service_links`, take under 300 ms against the local copy of
 * the data. A statement still running after this long is stuck rather than
 * slow, and it must not hold a request for longer than an upstream adapter
 * call may take.
 */
export const DATABASE_STATEMENT_TIMEOUT_MS = 10_000;

/** How long a request waits for a free connection or a new one before failing. */
const CONNECTION_TIMEOUT_MS = 2_000;

/** How long an unused connection stays open before the pool closes it. */
const IDLE_TIMEOUT_MS = 30_000;

/** Connection cap of the shared runtime pool. */
const SHARED_POOL_MAX_CONNECTIONS = 20;

let sharedPool: pgModule.Pool | null = null;

/**
 * Creates a pool with the runtime limits: a connection timeout, an idle
 * timeout and a server-side statement timeout. An idle client that errors is
 * logged instead of raising an unhandled `error` event, which would end the
 * process.
 *
 * @param connectionString - The runtime database URL, never an administrative one.
 * @param maxConnections - The pool's connection cap.
 * @returns A new pool. The caller owns it and ends it.
 */
export function createDatabasePool(connectionString: string, maxConnections: number): pgModule.Pool {
  const pool = new pgModule.Pool({
    connectionString,
    max: maxConnections,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
  });
  pool.on("error", (err) => {
    log.error("PG", "Unexpected error on idle client:", err);
  });
  return pool;
}

/**
 * Returns the shared runtime pool, creating it on first use. Lazy so a module
 * can be imported without a database configuration, as tests and scripts do.
 *
 * @returns The process-wide pool.
 */
export function getDatabasePool(): pgModule.Pool {
  sharedPool ??= createDatabasePool(loadDatabaseConfig().url, SHARED_POOL_MAX_CONNECTIONS);
  return sharedPool;
}

/**
 * Ends the shared pool. A later {@link getDatabasePool} call creates a new one,
 * so a script that closes and reopens the repository keeps working.
 */
export async function closeDatabasePool(): Promise<void> {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
}

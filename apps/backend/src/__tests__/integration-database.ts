import { afterAll, beforeAll, vi } from "vitest";

/**
 * Whether an integration test may run against the database at `url`.
 *
 * Integration tests write and delete rows, so they run only where that cannot
 * reach shared data: a database on this machine, or one whose name marks it as
 * a test or integration database. Anything else, including a missing or
 * unparseable URL, skips the suite.
 *
 * @param url - The connection string the suite would use.
 * @returns True for a local host or a database named as a test database.
 */
export function isSafeIntegrationDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || /(^|[_-])(test|integration)([_-]|$)/.test(databaseName);
  } catch {
    return false;
  }
}

/**
 * The database an integration test runs against, or `undefined` to skip it.
 *
 * Every integration test reads `TEST_DATABASE_URL` through this and nothing
 * else, so exporting `DATABASE_URL` for the development database never points
 * a suite at it. CI sets the variable to a Postgres service container that
 * exists for the run alone.
 *
 * @returns `TEST_DATABASE_URL` when {@link isSafeIntegrationDatabase} accepts it, otherwise `undefined`.
 */
export function integrationDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  return isSafeIntegrationDatabase(url) ? url : undefined;
}

/**
 * Points the repository singletons at the integration database for one suite.
 *
 * `getRepository()` reads `DATABASE_URL` when it first connects, so a suite
 * that goes through it stubs that variable with the integration database for
 * its own run and restores it afterwards. Call it at the top of the suite's
 * `describe` block, which registers the two hooks there.
 */
export function connectRepositoriesToIntegrationDatabase(): void {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", integrationDatabaseUrl() ?? "");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
}

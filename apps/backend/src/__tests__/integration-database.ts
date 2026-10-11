/**
 * Whether an integration test may run against the database at `url`.
 *
 * Integration tests write and delete rows, so they run only where that cannot
 * reach shared data: a database on this machine, or one whose name marks it as
 * a test or integration database. Anything else, including a missing or
 * unparseable URL, skips the suite.
 *
 * @param url - The connection string the suite would use, usually `DATABASE_URL`.
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

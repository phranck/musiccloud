/** The LAN server whose OrbStack runs the development database container. */
export const DEVELOPMENT_DATABASE_SERVER = "macserver.local";

/** Host names as `URL.hostname` reports them, which keeps the brackets of an IPv6 address. */
const LOOPBACK_DATABASE_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

/**
 * Whether a database host belongs to the development setup rather than to production.
 * The development database lives on the machine running the code or on {@link DEVELOPMENT_DATABASE_SERVER}.
 * Every guard that tells development from production reads this one list.
 *
 * @param hostname - The host of a connection URL, as `URL.hostname` returns it.
 * @returns True for loopback hosts and the development database server.
 */
export function isDevelopmentDatabaseHost(hostname: string): boolean {
  return hostname === DEVELOPMENT_DATABASE_SERVER || LOOPBACK_DATABASE_HOSTS.includes(hostname);
}

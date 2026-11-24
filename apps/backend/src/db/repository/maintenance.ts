/**
 * Repository contract for catalog maintenance: refreshing a track's
 * timestamp, the scheduled stale-cache cleanup, and the readiness probe for
 * missing tables. `postgres-admin-catalog.ts` and `postgres-artists.ts`
 * implement it behind the `PostgresAdapter` facade.
 */

/**
 * Keeps the catalog tables fresh and reports whether they exist.
 * `TrackRepository` extends it, so every caller of the full repository keeps
 * these methods.
 */
export interface CatalogMaintenanceRepository {
  // Maintenance
  /**
   * Updates track timestamp.
   *
   * @param trackId - The `trackId` value.
   * @returns A promise that resolves when the operation completes.
   */
  updateTrackTimestamp(trackId: string): Promise<void>;
  /**
   * Handles cleanup stale cache.
   *
   * @param ttlMs - The `ttlMs` value.
   * @returns The numeric result of the query or mutation.
   */
  cleanupStaleCache(ttlMs?: number): Promise<number>;

  // Readiness probe: returns the subset of `expected` table names that are
  // missing from the public schema (empty list = all present).
  /**
   * Finds missing tables.
   *
   * @param expected - The `expected` value.
   * @returns The matching rows.
   */
  findMissingTables(expected: string[]): Promise<string[]>;
}

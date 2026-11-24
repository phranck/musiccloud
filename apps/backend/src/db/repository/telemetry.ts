/**
 * Repository contract for Apple client telemetry: the diagnostic events the
 * TestFlight builds report, and their retention cleanup. `postgres-telemetry.ts`
 * implements it behind the `PostgresAdapter` facade.
 */

/** Payload accepted by `insertAppTelemetryEvent`. Shape matches the
 * /api/v1/telemetry/app-error request body one-to-one. */
export interface AppTelemetryEventInput {
  eventType: string;
  eventTime: Date;
  installId: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  locale: string;
  sourceUrl: string | null;
  service: string | null;
  errorKind: string;
  httpStatus: number | null;
  message: string;
}

/**
 * Writes and prunes Apple client telemetry events. `TrackRepository` extends
 * it, so every caller of the full repository keeps these methods.
 */
export interface AppTelemetryRepository {
  // Apple client telemetry (Testflight diagnostics)
  /**
   * Inserts app telemetry event.
   *
   * @param row - The `row` value.
   * @returns A promise that resolves when the operation completes.
   */
  insertAppTelemetryEvent(row: AppTelemetryEventInput): Promise<void>;

  /**
   * Deletes the app telemetry events received before a moment.
   *
   * @param cutoffMs - Epoch milliseconds. Rows received earlier are removed.
   * @returns How many rows were removed.
   */
  deleteAppTelemetryEventsBefore(cutoffMs: number): Promise<number>;
}

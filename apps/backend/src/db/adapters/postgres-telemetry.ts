/**
 * App telemetry persistence for the PostgreSQL adapter.
 */

import type { Pool } from "pg";
import type { AppTelemetryEventInput } from "../repository.js";

/**
 * Persists one native-app telemetry event.
 *
 * Used by mobile / desktop clients to report non-website diagnostics
 * such as resolve failures, HTTP status codes and client build metadata.
 */
export async function insertAppTelemetryEvent(pool: Pool, row: AppTelemetryEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO app_telemetry_events
       (event_type, event_time, install_id, app_version, build_number,
        platform, os_version, device_model, locale,
        source_url, service, error_kind, http_status, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      row.eventType,
      row.eventTime,
      row.installId,
      row.appVersion,
      row.buildNumber,
      row.platform,
      row.osVersion,
      row.deviceModel,
      row.locale,
      row.sourceUrl,
      row.service,
      row.errorKind,
      row.httpStatus,
      row.message,
    ],
  );
}

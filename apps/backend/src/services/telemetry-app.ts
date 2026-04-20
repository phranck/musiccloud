/**
 * Ingest an app-side error event from the Apple client (Testflight).
 *
 * The handler trusts the shape validated by the Fastify schema, then trims
 * free-text fields that could balloon the row (message up to 2 KB, URL up
 * to 2 KB) before persisting. Larger bodies are rejected at the route
 * layer via bodyLimit — this is defence in depth for the serialised length
 * the DB stores.
 */
import { getRepository } from "../db/index.js";
import type { AppTelemetryEventInput } from "../db/repository.js";

const MAX_MESSAGE_LEN = 2_000;
const MAX_URL_LEN = 2_000;

export interface AppTelemetryRequest {
  eventType: string;
  eventTime: string;
  installId: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  locale: string;
  sourceUrl?: string | null;
  service?: string | null;
  errorKind: string;
  httpStatus?: number | null;
  message: string;
}

function trim(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export async function ingestAppTelemetryEvent(payload: AppTelemetryRequest): Promise<void> {
  const eventTime = new Date(payload.eventTime);
  if (Number.isNaN(eventTime.getTime())) {
    throw new Error("Invalid eventTime");
  }
  const row: AppTelemetryEventInput = {
    eventType: payload.eventType,
    eventTime,
    installId: payload.installId,
    appVersion: payload.appVersion,
    buildNumber: payload.buildNumber,
    platform: payload.platform,
    osVersion: payload.osVersion,
    deviceModel: payload.deviceModel,
    locale: payload.locale,
    sourceUrl: payload.sourceUrl ? trim(payload.sourceUrl, MAX_URL_LEN) : null,
    service: payload.service ?? null,
    errorKind: payload.errorKind,
    httpStatus: payload.httpStatus ?? null,
    message: trim(payload.message, MAX_MESSAGE_LEN),
  };
  const repo = await getRepository();
  await repo.insertAppTelemetryEvent(row);
}

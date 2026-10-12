/**
 * @file The admin read of one project's audit trail: the range and the row
 * ceiling it may ask for, and the shape each entry leaves the server in.
 *
 * Every read is bounded twice, by a range no wider than the trail is kept and
 * by a row ceiling, so no request can ask for the whole table.
 */
import { type ApiAccessAuditActor, ApiAccessAuditActorType, type ApiAccessAuditTrail } from "@musiccloud/shared";

import type { ApiAccessAuditEntry } from "../db/api-access-repository.js";
import { AUDIT_RETENTION_DAYS, RETENTION_DAY_MS } from "./api-access-retention.js";

/** The range a read covers when it names none: the last thirty days. */
export const AUDIT_DEFAULT_RANGE_MS = 30 * RETENTION_DAY_MS;

/** The widest range a read may cover, which is as far back as the trail is kept. */
export const AUDIT_MAX_RANGE_MS = AUDIT_RETENTION_DAYS * RETENTION_DAY_MS;

/** How many entries a read returns when it names no limit. */
export const AUDIT_DEFAULT_LIMIT = 50;

/** The most entries one read may return. */
export const AUDIT_MAX_LIMIT = 200;

/**
 * The `eventData` keys an entry may show.
 *
 * Some writers store the whole request body, so the stored object holds
 * whatever a caller sent. Only these keys leave the server: each names a field
 * of a project, an application, a plan or a key's lineage, and none of them can
 * hold a credential.
 */
export const AUDIT_EVENT_DATA_KEYS = [
  "displayName",
  "status",
  "requestsPerMinute",
  "requestsPerDay",
  "tierId",
  "tierName",
  "interval",
  "cancelAtPeriodEnd",
  "registrationType",
  "publicClientId",
  "websiteUrl",
  "rotatedFromTokenId",
] as const;

/** A resolved, bounded read of one project's trail. */
export interface AuditWindow {
  /** Start, epoch ms, inclusive. */
  from: number;
  /** End, epoch ms, exclusive. */
  to: number;
  /** The most entries to return. */
  limit: number;
}

/** Why a requested read was refused. */
export interface AuditWindowRejection {
  message: string;
}

/**
 * Resolves the range and the row ceiling of an audit read.
 *
 * Every parameter is optional. With none, the read covers the last thirty days
 * and returns at most {@link AUDIT_DEFAULT_LIMIT} entries.
 *
 * @param query - The `from`, `to` and `limit` query parameters, as given.
 * @param now - The moment to resolve an open end against.
 * @returns The resolved window, or the reason it was refused.
 */
export function resolveAuditWindow(
  query: { from?: string; to?: string; limit?: number },
  now: number,
): AuditWindow | AuditWindowRejection {
  const to = query.to === undefined ? now : Date.parse(query.to);
  if (Number.isNaN(to)) return { message: "to must be an ISO date." };

  const from = query.from === undefined ? to - AUDIT_DEFAULT_RANGE_MS : Date.parse(query.from);
  if (Number.isNaN(from)) return { message: "from must be an ISO date." };

  if (from >= to) return { message: "from must be before to." };
  if (to - from > AUDIT_MAX_RANGE_MS) {
    return { message: `The range may cover at most ${AUDIT_RETENTION_DAYS} days.` };
  }

  return { from, to, limit: query.limit ?? AUDIT_DEFAULT_LIMIT };
}

/**
 * Whether resolving an audit read failed.
 *
 * @param result - What {@link resolveAuditWindow} returned.
 * @returns `true` when the read was refused.
 */
export function isAuditWindowRejection(result: AuditWindow | AuditWindowRejection): result is AuditWindowRejection {
  return "message" in result;
}

/** The actor of an entry. Exactly one of the two ids is set while its account exists. */
function auditActor(entry: ApiAccessAuditEntry): ApiAccessAuditActor | null {
  if (entry.actorAdminId) {
    return { type: ApiAccessAuditActorType.Admin, id: entry.actorAdminId, name: entry.actorAdminUsername };
  }
  if (entry.actorDeveloperAccountId) {
    return {
      type: ApiAccessAuditActorType.Developer,
      id: entry.actorDeveloperAccountId,
      name: entry.actorDeveloperEmail,
    };
  }
  return null;
}

/** The recorded details an entry may show, by {@link AUDIT_EVENT_DATA_KEYS}. */
function auditDetails(eventData: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const key of AUDIT_EVENT_DATA_KEYS) {
    if (eventData[key] !== undefined) details[key] = eventData[key];
  }
  return details;
}

/**
 * One project's trail in the shape the admin read answers with.
 *
 * @param projectId - The project the trail belongs to.
 * @param window - The resolved range and ceiling.
 * @param rows - The entries the repository returned for one more than the
 *   ceiling, so a full page can be told from a truncated one.
 * @returns The response body.
 */
export function toAuditTrailResponse(
  projectId: string,
  window: AuditWindow,
  rows: ApiAccessAuditEntry[],
): ApiAccessAuditTrail {
  return {
    projectId,
    from: new Date(window.from).toISOString(),
    to: new Date(window.to).toISOString(),
    limit: window.limit,
    truncated: rows.length > window.limit,
    entries: rows.slice(0, window.limit).map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      occurredAt: new Date(entry.occurredAt).toISOString(),
      applicationId: entry.clientId,
      apiKeyId: entry.tokenId,
      actor: auditActor(entry),
      details: auditDetails(entry.eventData),
    })),
  };
}

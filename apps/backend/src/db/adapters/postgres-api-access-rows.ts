/**
 * API-access row layer: the raw row shapes of the developer API tables, the
 * SQL fragments every read shares, `GRANTING_SUBSCRIPTION_STATES`, and the
 * mappers that turn rows into DTOs. Timestamp columns are mapped to epoch
 * milliseconds via {@link dateToMs}.
 *
 * The aggregate modules `postgres-developer-projects.ts`,
 * `postgres-api-clients.ts`, `postgres-api-client-tokens.ts` and
 * `postgres-api-access-audit.ts` import from here.
 * `postgres-api-access.ts` re-exports only `GRANTING_SUBSCRIPTION_STATES`, so
 * the fragments and mappers stay internal to the adapter layer.
 */

import {
  type ApiClientStatusValue,
  type ApiTokenStatusValue,
  ClientRegistrationType,
  type ClientRegistrationTypeValue,
  DeveloperProjectStatus,
  type DeveloperProjectStatusValue,
} from "@musiccloud/shared";
import type {
  ApiAccessAuditEvent,
  ApiClient,
  ApiClientToken,
  ApiUsageEvent,
  DeveloperProject,
  DeveloperProjectSubscription,
} from "../api-access-repository.js";
import { dateToMs } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw `developer_projects` row as `PROJECT_JOIN_SELECT` returns it, with the
 * granting tier's id, name and limits joined in.
 */
export interface DeveloperProjectRow {
  id: string;
  developer_account_id: string;
  display_name: string;
  status: DeveloperProjectStatusValue;
  requests_per_minute: number | null;
  requests_per_day: number | null;
  tier_id: string | null;
  tier_name: string | null;
  tier_requests_per_minute: number | null;
  tier_requests_per_day: number | null;
  created_at: Date;
  updated_at: Date;
  suspended_at: Date | null;
  deleted_at: Date | null;
  created_by_admin_id: string | null;
}

/**
 * Raw `developer_project_subscriptions` row as `SUBSCRIPTION_COLUMNS` selects it.
 */
export interface DeveloperProjectSubscriptionRow {
  id: string;
  project_id: string;
  tier_id: string | null;
  creem_subscription_id: string | null;
  creem_customer_id: string | null;
  status: string;
  interval: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Raw shape of the registration JOIN used by every registration read: the
 * `api_clients` compatibility row plus project ownership and quota columns.
 * Account-tier fallback remains only for transitional rows awaiting backfill.
 */
export interface ApiClientRow {
  id: string;
  developer_account_id: string;
  project_id: string | null;
  public_client_id: string | null;
  registration_type: ClientRegistrationTypeValue | null;
  capabilities: unknown;
  project_display_name: string | null;
  project_status: DeveloperProjectStatusValue | null;
  project_requests_per_minute: number | null;
  project_requests_per_day: number | null;
  project_developer_account_id: string | null;
  project_created_at: Date | null;
  project_updated_at: Date | null;
  project_suspended_at: Date | null;
  project_deleted_at: Date | null;
  project_created_by_admin_id: string | null;
  app_name: string;
  contact_email: string;
  description: string;
  website_url: string | null;
  status: ApiClientStatusValue;
  requests_per_minute: number | null;
  requests_per_day: number | null;
  tier_id: string | null;
  tier_name: string | null;
  tier_requests_per_minute: number | null;
  tier_requests_per_day: number | null;
  created_at: Date;
  updated_at: Date;
  created_by_admin_id: string | null;
}

/**
 * Raw `api_client_tokens` row as `TOKEN_COLUMNS` selects it.
 */
export interface ApiClientTokenRow {
  id: string;
  client_id: string;
  token_prefix: string;
  token_hash: string;
  status: ApiTokenStatusValue;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  rotated_from_token_id: string | null;
}

/**
 * Raw `api_access_audit_events` row as `AUDIT_COLUMNS` selects it.
 */
export interface ApiAccessAuditEventRow {
  id: string;
  project_id: string | null;
  client_id: string | null;
  token_id: string | null;
  event_type: string;
  actor_admin_id: string | null;
  actor_developer_account_id: string | null;
  occurred_at: Date;
  event_data: Record<string, unknown>;
}

/**
 * Raw `api_usage_events` row as `USAGE_COLUMNS` selects it.
 */
export interface ApiUsageEventRow {
  id: string;
  occurred_at: Date;
  request_id: string;
  project_id: string;
  registration_id: string;
  token_id: string | null;
  method: string;
  endpoint_template: string;
  status_code: number;
  duration_ms: number;
}

/**
 * The subscription states in which a project's plan grants its tier's limits.
 * `scheduled_cancel` grants because such a subscription runs to the end of the
 * period it was cancelled in. Every other state
 * `chk_developer_project_subscriptions_status` admits (`paused`, `past_due`,
 * `expired`, `canceled`) withholds the tier, and a request against that project
 * is refused rather than falling through to a second answer.
 */
export const GRANTING_SUBSCRIPTION_STATES = ["active", "trialing", "scheduled_cancel"] as const;

/**
 * The same states as a SQL list, derived from the array above so the two
 * cannot disagree. The values are literals in this file, never request input.
 */
export const GRANTING_SUBSCRIPTION_STATES_SQL = GRANTING_SUBSCRIPTION_STATES.map((state) => `'${state}'`).join(", ");

/**
 * Joins a project to the subscription that currently grants it something, and
 * to that subscription's tier. A subscription in any other state joins to
 * nothing, which is what makes the plan's state decide the quota.
 */
export const GRANTING_SUBSCRIPTION_JOIN = `LEFT JOIN developer_project_subscriptions ps
       ON ps.project_id = p.id AND ps.status IN (${GRANTING_SUBSCRIPTION_STATES_SQL})
     LEFT JOIN tiers t ON t.id = ps.tier_id`;

/**
 * Selects a project with the tier its granting subscription supplies. Every
 * project read appends its own `WHERE` clause.
 */
export const PROJECT_JOIN_SELECT = `SELECT p.id, p.developer_account_id, p.display_name, p.status,
            p.requests_per_minute, p.requests_per_day, p.created_at, p.updated_at, p.suspended_at, p.deleted_at,
            p.created_by_admin_id, ps.tier_id AS tier_id, t.name AS tier_name,
            t.requests_per_minute AS tier_requests_per_minute, t.requests_per_day AS tier_requests_per_day
     FROM developer_projects p
     ${GRANTING_SUBSCRIPTION_JOIN}`;
/**
 * Column list of `developer_project_subscriptions`, in the shape
 * `DeveloperProjectSubscriptionRow` reads.
 */
export const SUBSCRIPTION_COLUMNS = `id, project_id, tier_id, creem_subscription_id, creem_customer_id, status,
            interval, current_period_end, cancel_at_period_end, created_at, updated_at`;
/**
 * Every registration read goes through this JOIN so the DTO always carries
 * project quota inputs, the project tier, and optional registration caps. The
 * project's own subscription is the only source of the tier; there is no
 * fallback to the owning account's tier, so one question has one answer.
 */
export const CLIENT_JOIN_SELECT = `SELECT c.id, c.developer_account_id, c.project_id,
            c.public_client_id, c.registration_type, c.capabilities, c.app_name, c.contact_email,
            c.description, c.website_url, c.status, c.requests_per_minute, c.requests_per_day,
            c.created_at, c.updated_at,
            c.created_by_admin_id, p.display_name AS project_display_name, p.status AS project_status,
            p.requests_per_minute AS project_requests_per_minute,
            p.requests_per_day AS project_requests_per_day,
            p.developer_account_id AS project_developer_account_id,
            p.created_at AS project_created_at, p.updated_at AS project_updated_at,
            p.suspended_at AS project_suspended_at, p.deleted_at AS project_deleted_at,
            p.created_by_admin_id AS project_created_by_admin_id,
            ps.tier_id AS tier_id, t.name AS tier_name,
            t.requests_per_minute AS tier_requests_per_minute, t.requests_per_day AS tier_requests_per_day
     FROM api_clients c
     LEFT JOIN developer_projects p ON p.id = c.project_id
     ${GRANTING_SUBSCRIPTION_JOIN}`;
/**
 * Column list of `api_client_tokens`, in the shape `ApiClientTokenRow` reads.
 */
export const TOKEN_COLUMNS = `id, client_id, token_prefix, token_hash, status, created_at, last_used_at,
            revoked_at, rotated_from_token_id`;
/**
 * Column list of `api_access_audit_events`, in the shape
 * `ApiAccessAuditEventRow` reads.
 */
export const AUDIT_COLUMNS = `id, project_id, client_id, token_id, event_type, actor_admin_id,
            actor_developer_account_id, occurred_at, event_data`;
/**
 * Column list of `api_usage_events`, in the shape `ApiUsageEventRow` reads.
 */
export const USAGE_COLUMNS = `id, occurred_at, request_id, project_id, registration_id, token_id, method,
            endpoint_template, status_code, duration_ms`;

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * The per-window limit a project's plan grants, or `null` when no granting
 * subscription supplies a tier. A per-project override adjusts the plan's
 * number; it does not stand in for a plan, so a project without one has no
 * quota rather than an administrative one.
 *
 * @param override - The project's own limit, or `null` to take the tier's.
 * @param tierLimit - The granting tier's limit, or `null` when no tier is granted.
 * @returns The limit to enforce, or `null` when nothing grants one.
 */
export function effectiveLimit(override: number | null, tierLimit: number | null): number | null {
  return tierLimit === null ? null : (override ?? tierLimit);
}

/**
 * Narrows a project limit by an optional registration cap. A cap can only
 * narrow, and there is nothing to narrow when the project has no limit.
 *
 * @param cap - The registration's own cap, or `null` to take the project limit unchanged.
 * @param projectLimit - The project's resolved limit, or `null` when no plan grants one.
 * @returns The limit to enforce for this registration, or `null`.
 */
export function narrowedByCap(cap: number | null, projectLimit: number | null): number | null {
  if (projectLimit === null) return null;
  return cap === null ? projectLimit : Math.min(cap, projectLimit);
}

/**
 * Maps a project JOIN row to its DTO. The effective limits resolve through
 * `effectiveLimit`, so they are `null` when no granting subscription supplies a tier.
 *
 * @param row - The raw `PROJECT_JOIN_SELECT` row.
 * @returns The `DeveloperProject` DTO.
 */
export function rowToDeveloperProject(row: DeveloperProjectRow): DeveloperProject {
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    displayName: row.display_name,
    status: row.status,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    tierId: row.tier_id,
    tierName: row.tier_name,
    tierRequestsPerMinute: row.tier_requests_per_minute,
    tierRequestsPerDay: row.tier_requests_per_day,
    effectiveRequestsPerMinute: effectiveLimit(row.requests_per_minute, row.tier_requests_per_minute),
    effectiveRequestsPerDay: effectiveLimit(row.requests_per_day, row.tier_requests_per_day),
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    suspendedAt: row.suspended_at ? dateToMs(row.suspended_at) : null,
    deletedAt: row.deleted_at ? dateToMs(row.deleted_at) : null,
    createdByAdminId: row.created_by_admin_id,
  };
}

/**
 * Maps a subscription row to its DTO, converting timestamps to epoch milliseconds.
 *
 * @param row - The raw `developer_project_subscriptions` row.
 * @returns The `DeveloperProjectSubscription` DTO.
 */
export function rowToDeveloperProjectSubscription(row: DeveloperProjectSubscriptionRow): DeveloperProjectSubscription {
  return {
    id: row.id,
    projectId: row.project_id,
    tierId: row.tier_id,
    creemSubscriptionId: row.creem_subscription_id,
    creemCustomerId: row.creem_customer_id,
    status: row.status,
    interval: row.interval,
    currentPeriodEnd: row.current_period_end ? dateToMs(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
  };
}

/**
 * Maps a registration JOIN row to the {@link ApiClient} compatibility DTO.
 * Project limits resolve as `project override ?? granting tier`; an optional
 * registration cap may narrow but never widen that result, and every limit is
 * `null` when no granting subscription supplies a tier.
 */
export function rowToApiClient(row: ApiClientRow): ApiClient {
  const projectMinuteLimit = effectiveLimit(row.project_requests_per_minute, row.tier_requests_per_minute);
  const projectDayLimit = effectiveLimit(row.project_requests_per_day, row.tier_requests_per_day);
  return {
    id: row.id,
    developerAccountId: row.developer_account_id,
    projectId: row.project_id ?? `legacy-account:${row.developer_account_id}`,
    publicClientId: row.public_client_id ?? row.id,
    registrationType: row.registration_type ?? ClientRegistrationType.Development,
    capabilities: Array.isArray(row.capabilities)
      ? row.capabilities.filter((value): value is string => typeof value === "string")
      : [],
    projectDisplayName: row.project_display_name ?? row.app_name,
    projectStatus: row.project_status ?? DeveloperProjectStatus.Active,
    projectRequestsPerMinute: row.project_requests_per_minute,
    projectRequestsPerDay: row.project_requests_per_day,
    appName: row.app_name,
    contactEmail: row.contact_email,
    description: row.description,
    websiteUrl: row.website_url,
    status: row.status,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    tierId: row.tier_id,
    tierName: row.tier_name,
    tierRequestsPerMinute: row.tier_requests_per_minute,
    tierRequestsPerDay: row.tier_requests_per_day,
    effectiveRequestsPerMinute: narrowedByCap(row.requests_per_minute, projectMinuteLimit),
    effectiveRequestsPerDay: narrowedByCap(row.requests_per_day, projectDayLimit),
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
    createdByAdminId: row.created_by_admin_id,
  };
}

/**
 * Maps a token row to its DTO, converting timestamps to epoch milliseconds.
 *
 * @param row - The raw `api_client_tokens` row.
 * @returns The `ApiClientToken` DTO.
 */
export function rowToApiClientToken(row: ApiClientTokenRow): ApiClientToken {
  return {
    id: row.id,
    clientId: row.client_id,
    tokenPrefix: row.token_prefix,
    tokenHash: row.token_hash,
    status: row.status,
    createdAt: dateToMs(row.created_at),
    lastUsedAt: row.last_used_at ? dateToMs(row.last_used_at) : null,
    revokedAt: row.revoked_at ? dateToMs(row.revoked_at) : null,
    rotatedFromTokenId: row.rotated_from_token_id,
  };
}

/**
 * Maps a usage event row to its DTO, converting the timestamp to epoch milliseconds.
 *
 * @param row - The raw `api_usage_events` row.
 * @returns The `ApiUsageEvent` DTO.
 */
export function rowToApiUsageEvent(row: ApiUsageEventRow): ApiUsageEvent {
  return {
    id: row.id,
    occurredAt: dateToMs(row.occurred_at),
    requestId: row.request_id,
    projectId: row.project_id,
    registrationId: row.registration_id,
    tokenId: row.token_id,
    method: row.method,
    endpointTemplate: row.endpoint_template,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
  };
}

/**
 * Maps an audit event row to its DTO. A missing `event_data` becomes an empty object.
 *
 * @param row - The raw `api_access_audit_events` row.
 * @returns The `ApiAccessAuditEvent` DTO.
 */
export function rowToApiAccessAuditEvent(row: ApiAccessAuditEventRow): ApiAccessAuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    clientId: row.client_id,
    tokenId: row.token_id,
    eventType: row.event_type,
    actorAdminId: row.actor_admin_id,
    actorDeveloperAccountId: row.actor_developer_account_id,
    occurredAt: dateToMs(row.occurred_at),
    eventData: row.event_data ?? {},
  };
}

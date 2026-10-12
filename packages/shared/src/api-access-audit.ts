/**
 * @file The shape of one Project's audit trail, as the admin read answers
 * with it and the dashboard reads it.
 */

/** The two kinds of account that act on a Project. */
export const ApiAccessAuditActorType = {
  Admin: "admin",
  Developer: "developer",
} as const;

export type ApiAccessAuditActorTypeValue = (typeof ApiAccessAuditActorType)[keyof typeof ApiAccessAuditActorType];

/** Who acted on a Project, by account type. */
export interface ApiAccessAuditActor {
  type: ApiAccessAuditActorTypeValue;
  id: string;
  /** The admin's username or the developer's sign-in address, or `null` where it could not be resolved. */
  name: string | null;
}

/** One entry of a Project's audit trail. */
export interface ApiAccessAuditTrailEntry {
  id: string;
  /** What happened, such as `project_updated` or `token_created`. */
  eventType: string;
  /** When it happened, as an ISO 8601 timestamp. */
  occurredAt: string;
  /** The Application the change concerned, or `null` for a change to the Project itself. */
  applicationId: string | null;
  /** The API-Key the change concerned, or `null`. */
  apiKeyId: string | null;
  /** Who acted, or `null` when the acting account has since been removed. */
  actor: ApiAccessAuditActor | null;
  /** The recorded details, limited to the fields a trail may show. */
  details: Record<string, unknown>;
}

/** One Project's audit trail over a bounded range, newest first. */
export interface ApiAccessAuditTrail {
  projectId: string;
  /** Start of the range, ISO 8601, inclusive. */
  from: string;
  /** End of the range, ISO 8601, exclusive. */
  to: string;
  /** The most entries the read returns. */
  limit: number;
  /** Whether the range holds more entries than the limit let through. */
  truncated: boolean;
  entries: ApiAccessAuditTrailEntry[];
}

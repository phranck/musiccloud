/**
 * @file The lifecycle states of what a developer holds: the account, its
 * projects, the applications registered under a project, and the tokens an
 * application authenticates with.
 *
 * The database checks, the backend routes, the admin dashboard and the
 * developer portal all read these values from here, so a state the database
 * accepts is one every interface knows how to name.
 *
 * Subscription states are billing vocabulary and live with the billing module.
 */

/** Whether a developer account may use the portal and its credentials. */
export const DeveloperAccountStatus = {
  /** Signed in and working. */
  Active: "active",
  /** Blocked by an admin; every application under it is suspended with it. */
  Suspended: "suspended",
} as const;

/** A {@link DeveloperAccountStatus} member value. */
export type DeveloperAccountStatusValue = (typeof DeveloperAccountStatus)[keyof typeof DeveloperAccountStatus];

/** Every {@link DeveloperAccountStatus} value, in the order the namespace lists them. */
export const DEVELOPER_ACCOUNT_STATUSES: readonly DeveloperAccountStatusValue[] = Object.values(DeveloperAccountStatus);

/** The lifecycle of a Developer Project. */
export const DeveloperProjectStatus = {
  /** Live: its applications can hold working credentials. */
  Active: "active",
  /** Temporarily stopped; reversible. */
  Suspended: "suspended",
  /** Soft-deleted: the row survives for the audit trail, the project does not. */
  Deleted: "deleted",
} as const;

/** A {@link DeveloperProjectStatus} member value. */
export type DeveloperProjectStatusValue = (typeof DeveloperProjectStatus)[keyof typeof DeveloperProjectStatus];

/** Every {@link DeveloperProjectStatus} value. */
export const DEVELOPER_PROJECT_STATUSES: readonly DeveloperProjectStatusValue[] = Object.values(DeveloperProjectStatus);

/** The lifecycle of an application registered under a project. */
export const ApiClientStatus = {
  /** Live: its tokens authenticate requests. */
  Active: "active",
  /** Temporarily blocked. */
  Suspended: "suspended",
  /** Permanently withdrawn. */
  Revoked: "revoked",
} as const;

/** An {@link ApiClientStatus} member value. */
export type ApiClientStatusValue = (typeof ApiClientStatus)[keyof typeof ApiClientStatus];

/** Every {@link ApiClientStatus} value. */
export const API_CLIENT_STATUSES: readonly ApiClientStatusValue[] = Object.values(ApiClientStatus);

/** How an application can protect its credentials. */
export const ClientRegistrationType = {
  Development: "development",
  Confidential: "confidential",
  Public: "public",
} as const;

/** A {@link ClientRegistrationType} member value. */
export type ClientRegistrationTypeValue = (typeof ClientRegistrationType)[keyof typeof ClientRegistrationType];

/** Every {@link ClientRegistrationType} value. */
export const CLIENT_REGISTRATION_TYPES: readonly ClientRegistrationTypeValue[] = Object.values(ClientRegistrationType);

/** The lifecycle of an issued API token. */
export const ApiTokenStatus = {
  /** Valid for authentication. */
  Active: "active",
  /** Explicitly revoked. */
  Revoked: "revoked",
  /** Replaced by a rotation; permanently invalid. */
  Rotated: "rotated",
} as const;

/** An {@link ApiTokenStatus} member value. */
export type ApiTokenStatusValue = (typeof ApiTokenStatus)[keyof typeof ApiTokenStatus];

/** Every {@link ApiTokenStatus} value. */
export const API_TOKEN_STATUSES: readonly ApiTokenStatusValue[] = Object.values(ApiTokenStatus);

/** Whether `value` is one of `values`, typed so a guard can narrow to the list's union. */
function belongsTo<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Whether a request value is a {@link DeveloperAccountStatus}. */
export function isDeveloperAccountStatus(value: unknown): value is DeveloperAccountStatusValue {
  return belongsTo(DEVELOPER_ACCOUNT_STATUSES, value);
}

/** Whether a request value is a {@link DeveloperProjectStatus}. */
export function isDeveloperProjectStatus(value: unknown): value is DeveloperProjectStatusValue {
  return belongsTo(DEVELOPER_PROJECT_STATUSES, value);
}

/** Whether a request value is an {@link ApiClientStatus}. */
export function isApiClientStatus(value: unknown): value is ApiClientStatusValue {
  return belongsTo(API_CLIENT_STATUSES, value);
}

/** Whether a request value is a {@link ClientRegistrationType}. */
export function isClientRegistrationType(value: unknown): value is ClientRegistrationTypeValue {
  return belongsTo(CLIENT_REGISTRATION_TYPES, value);
}

/** Any state of an account, a project, an application or a token. */
export type DeveloperAccessStatusValue =
  | DeveloperAccountStatusValue
  | DeveloperProjectStatusValue
  | ApiClientStatusValue
  | ApiTokenStatusValue;

/**
 * What every state is called on screen.
 *
 * One table serves all four lifecycles, because a word means the same thing in
 * each of them: a suspended account and a suspended application are stopped
 * the same way, and a revoked application and a revoked token are both gone.
 */
export const DEVELOPER_ACCESS_STATUS_LABELS: Readonly<Record<DeveloperAccessStatusValue, string>> = {
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  deleted: "Deleted",
  rotated: "Rotated",
};

/**
 * The label of a state, or the value itself for one this table does not know.
 *
 * An unknown value is shown as it is rather than hidden, so a state the backend
 * gains before an interface does is still visible.
 *
 * @param status - A status as a response carries it.
 * @returns The label to show.
 */
export function developerAccessStatusLabel(status: string): string {
  return Object.hasOwn(DEVELOPER_ACCESS_STATUS_LABELS, status)
    ? DEVELOPER_ACCESS_STATUS_LABELS[status as DeveloperAccessStatusValue]
    : status;
}

/** How long a project's or an application's name may be. */
export const MAX_APP_NAME_LENGTH = 200;

/** The scheme every issued API token starts with. */
export const API_TOKEN_PREFIX = "mc_live";

/**
 * A token as a list shows it: its non-secret prefix between the scheme and an
 * ellipsis. The secret part is never stored, so this is all any screen has.
 *
 * @param tokenPrefix - The token's stored 12-character `tokenPrefix`.
 * @returns For example `mc_live_abc123def456_...`.
 */
export function formatApiTokenForDisplay(tokenPrefix: string): string {
  return `${API_TOKEN_PREFIX}_${tokenPrefix}_...`;
}

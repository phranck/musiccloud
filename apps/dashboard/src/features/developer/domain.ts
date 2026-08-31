export const ApiClientStatus = {
  Active: "active",
  Suspended: "suspended",
  Revoked: "revoked",
} as const;
export type ApiClientStatus = (typeof ApiClientStatus)[keyof typeof ApiClientStatus];

export const ApiTokenStatus = {
  Active: "active",
  Revoked: "revoked",
  Rotated: "rotated",
} as const;
export type ApiTokenStatus = (typeof ApiTokenStatus)[keyof typeof ApiTokenStatus];

export const DeveloperProjectStatus = {
  Active: "active",
  Suspended: "suspended",
  Deleted: "deleted",
} as const;
export type DeveloperProjectStatus = (typeof DeveloperProjectStatus)[keyof typeof DeveloperProjectStatus];

/**
 * The states a project's subscription can hold, matching the check constraint
 * on `developer_project_subscriptions.status`.
 */
export const ProjectSubscriptionStatus = {
  Active: "active",
  Trialing: "trialing",
  Paused: "paused",
  PastDue: "past_due",
  Expired: "expired",
  Canceled: "canceled",
  ScheduledCancel: "scheduled_cancel",
} as const;
export type ProjectSubscriptionStatus = (typeof ProjectSubscriptionStatus)[keyof typeof ProjectSubscriptionStatus];

export const DeveloperAccountStatus = {
  Active: "active",
  Suspended: "suspended",
} as const;
export type DeveloperAccountStatus = (typeof DeveloperAccountStatus)[keyof typeof DeveloperAccountStatus];

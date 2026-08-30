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

export const DeveloperAccountStatus = {
  Active: "active",
  Suspended: "suspended",
} as const;
export type DeveloperAccountStatus = (typeof DeveloperAccountStatus)[keyof typeof DeveloperAccountStatus];

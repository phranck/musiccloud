export const AdminRole = {
  Owner: "owner",
  Admin: "admin",
  Moderator: "moderator",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
export type EditableAdminRole = typeof AdminRole.Admin | typeof AdminRole.Moderator;

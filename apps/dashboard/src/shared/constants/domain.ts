export const ADMIN_ROLES = ["owner", "admin", "moderator"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

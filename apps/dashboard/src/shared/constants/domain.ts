export const AdminRole = {
  Owner: "owner",
  Admin: "admin",
  Moderator: "moderator",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
export type EditableAdminRole = typeof AdminRole.Admin | typeof AdminRole.Moderator;

/**
 * How far each role reaches, lowest first. A role reaches every area its rank
 * meets. Typed over every role, so a role added to {@link AdminRole} without a
 * rank fails to compile.
 */
const ROLE_RANK: Record<AdminRole, number> = {
  [AdminRole.Moderator]: 0,
  [AdminRole.Admin]: 1,
  [AdminRole.Owner]: 2,
};

/** The parts of the dashboard that not every role may open. */
export const AdminArea = {
  /** Content, templates, developer management and system screens. */
  Administration: "administration",
  /** The list of dashboard users, with every user's name and address. */
  Users: "users",
  /** The developer portal's settings. */
  DeveloperSettings: "developerSettings",
} as const;

export type AdminArea = (typeof AdminArea)[keyof typeof AdminArea];

/**
 * The lowest role that may open each area. The route guards and the Sidebar
 * both read it, so a link the Sidebar shows is a route the guard admits.
 */
export const MINIMUM_ROLE_FOR_AREA: Record<AdminArea, AdminRole> = {
  [AdminArea.Administration]: AdminRole.Admin,
  [AdminArea.Users]: AdminRole.Owner,
  [AdminArea.DeveloperSettings]: AdminRole.Owner,
};

/**
 * Whether a role may open an area.
 *
 * @param role - The signed-in user's role, or `undefined` while nobody is.
 * @param area - The area to open.
 * @returns `true` when the role ranks at least as high as the area requires.
 */
export function canAccessArea(role: AdminRole | undefined, area: AdminArea): boolean {
  return role !== undefined && ROLE_RANK[role] >= ROLE_RANK[MINIMUM_ROLE_FOR_AREA[area]];
}

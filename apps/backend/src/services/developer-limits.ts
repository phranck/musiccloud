/**
 * @file The bounds on the open self-service creation path, as the operator
 * has set them.
 *
 * These are numbers the operator changes as the portal is used, not constants
 * a deployment fixes, so they live in `site_settings` beside the portal's
 * other operational switches. One module reads and writes them, so the route
 * that enforces a limit and the screen that sets it cannot disagree about what
 * it is or what happens when it has never been set.
 */
import { getSetting, setSetting } from "./site-settings.js";

/** Where the per-account project ceiling is stored. */
const MAX_PROJECTS_KEY = "developer_max_projects_per_account";

/**
 * The ceiling in force when the operator has never set one.
 *
 * Three is deliberately small: it is more than an evaluation needs and far
 * less than a loop wants, and raising it is one field away.
 */
export const DEFAULT_MAX_PROJECTS_PER_ACCOUNT = 3;

/** The narrowest and widest values the setting accepts. */
export const MIN_MAX_PROJECTS_PER_ACCOUNT = 1;
export const MAX_MAX_PROJECTS_PER_ACCOUNT = 1000;

/**
 * How many projects one account may hold.
 *
 * A missing or unreadable value resolves to the default rather than to no
 * limit, because a ceiling that disappears when a row is absent is not a
 * ceiling.
 *
 * @returns The ceiling to enforce.
 */
export async function getMaxProjectsPerAccount(): Promise<number> {
  const stored = await getSetting(MAX_PROJECTS_KEY);
  if (stored === null) return DEFAULT_MAX_PROJECTS_PER_ACCOUNT;
  // `Number` rather than `parseInt`, because `parseInt("2.5")` is 2 and a
  // ceiling that quietly becomes a different number is worse than one that
  // falls back to a stated default.
  const parsed = Number(stored);
  return isAssignableMaxProjects(parsed) ? parsed : DEFAULT_MAX_PROJECTS_PER_ACCOUNT;
}

/**
 * Whether a value may be stored as the ceiling.
 *
 * @param value - The candidate, already parsed.
 * @returns `true` when it is a whole number inside the permitted range.
 */
export function isAssignableMaxProjects(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_MAX_PROJECTS_PER_ACCOUNT && value <= MAX_MAX_PROJECTS_PER_ACCOUNT;
}

/**
 * Sets how many projects one account may hold.
 *
 * Lowering it below what an account already holds does not remove anything:
 * existing projects stay, and that account simply cannot create another until
 * it is under the new ceiling again.
 *
 * @param value - The new ceiling, already validated by {@link isAssignableMaxProjects}.
 */
export async function setMaxProjectsPerAccount(value: number): Promise<void> {
  await setSetting(MAX_PROJECTS_KEY, String(value));
}

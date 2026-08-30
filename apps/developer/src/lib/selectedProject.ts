/**
 * @file Which project the project-scoped dashboard screens are talking about.
 *
 * The selection is a reader's preference rather than account state, so it lives
 * in the browser and not on the server. It survives a reload, which is the
 * point: a developer who picked a project and pressed refresh should still be
 * looking at that project.
 *
 * The storage key carries a version because what is stored is a contract with
 * a browser that may still hold last month's shape.
 */

/** Where the selection lives. Versioned, so a changed shape can be ignored rather than misread. */
const SELECTED_PROJECT_KEY = "mc-dev-selected-project:v1";

/**
 * The project the developer last chose, if the browser still remembers one.
 *
 * @returns The stored project id, or `null` when nothing is stored or storage is unavailable.
 */
export function readSelectedProjectId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_KEY);
  } catch {
    // Storage can be disabled or full. A forgotten selection is a small loss,
    // so it is not worth failing a render over.
    return null;
  }
}

/**
 * Remembers the project the developer is looking at.
 *
 * @param projectId - The project to remember, or `null` to forget the selection.
 */
export function writeSelectedProjectId(projectId: string | null): void {
  try {
    if (projectId === null) {
      window.localStorage.removeItem(SELECTED_PROJECT_KEY);
      return;
    }
    window.localStorage.setItem(SELECTED_PROJECT_KEY, projectId);
  } catch {
    // See above: losing the selection is preferable to losing the interaction.
  }
}

/**
 * Picks which project a screen should show, given what the browser remembers
 * and what the account actually holds.
 *
 * A remembered project that no longer exists, because it was deleted or the
 * session belongs to somebody else, must not leave the screen pointing at
 * nothing, so the first project wins in that case.
 *
 * @param projectIds - The ids the account holds, in the order they are listed.
 * @param rememberedId - What {@link readSelectedProjectId} returned.
 * @returns The project to show, or `null` when the account holds none.
 */
export function resolveSelectedProjectId(projectIds: readonly string[], rememberedId: string | null): string | null {
  if (rememberedId !== null && projectIds.includes(rememberedId)) return rememberedId;
  return projectIds[0] ?? null;
}

/**
 * @file Where a project's own screens live.
 *
 * The rail, the project list and the project pages all address the same
 * screens, so the shape of those addresses is stated once here rather than
 * repeated at each place that links to one.
 */

/**
 * The address of a project's own screen.
 *
 * @param projectId - The project's public identifier.
 * @returns The path to that project's page.
 */
export function projectPath(projectId: string): string {
  return `/dashboard/projects/${projectId}`;
}

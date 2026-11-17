/**
 * @file Where the support prompt screens live in the dashboard, named once for
 * the route table, the sidebar and the pages that link between them.
 */

/** The list's route, relative to the dashboard's root route as the route table writes it. */
export const SUPPORT_PROMPTS_ROUTE = "sponsoring/support-prompts";

/** The list's absolute address, which the sidebar links to and the editor goes back to. */
export const SUPPORT_PROMPTS_PATH = `/${SUPPORT_PROMPTS_ROUTE}`;

/** The editor's route, whose `:promptId` segment names the prompt or {@link NEW_SUPPORT_PROMPT_ID}. */
export const SUPPORT_PROMPT_EDITOR_ROUTE = `${SUPPORT_PROMPTS_ROUTE}/:promptId`;

/** The editor segment that opens an empty prompt rather than a stored one. */
export const NEW_SUPPORT_PROMPT_ID = "new";

/**
 * The editor's address for one prompt.
 *
 * @param promptId - The prompt's id, or {@link NEW_SUPPORT_PROMPT_ID} for a new one.
 * @returns The absolute address, such as `/sponsoring/support-prompts/new`.
 */
export function supportPromptEditorPath(promptId: string): string {
  return `${SUPPORT_PROMPTS_PATH}/${promptId}`;
}

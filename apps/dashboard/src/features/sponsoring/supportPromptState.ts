/**
 * @file What a support prompt does on a given day, as the list shows it.
 */

import type { SupportPrompt } from "@musiccloud/shared";

/**
 * What a prompt does today, as a reader would experience it.
 *
 * - `draft`: unpublished, so it is not delivered at all.
 * - `scheduled`: published, and its window has not opened yet.
 * - `live`: published, and today lies inside its window or it has none.
 * - `expired`: published, and its window closed before today.
 */
export const SupportPromptState = {
  Draft: "draft",
  Scheduled: "scheduled",
  Live: "live",
  Expired: "expired",
} as const;

/** A {@link SupportPromptState} member value. */
export type SupportPromptStateValue = (typeof SupportPromptState)[keyof typeof SupportPromptState];

/**
 * Works out what a prompt does on a given day.
 *
 * The window is compared by day rather than by moment, so a prompt that names
 * its last day is still shown on that day.
 *
 * @param prompt - The prompt to judge.
 * @param today - The day to judge against, as `YYYY-MM-DD`.
 * @returns Whether it is a draft, waiting, running, or over.
 */
export function promptState(prompt: SupportPrompt, today: string): SupportPromptStateValue {
  if (!prompt.published) return SupportPromptState.Draft;
  if (prompt.startsAt && today < prompt.startsAt) return SupportPromptState.Scheduled;
  if (prompt.endsAt && today > prompt.endsAt) return SupportPromptState.Expired;
  return SupportPromptState.Live;
}

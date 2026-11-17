/**
 * @file Stores what bounds one reader across every support prompt together.
 *
 * Ported from lmaa.space (`apps/backend/src/services/support-prompts.ts`). One
 * `site_settings` row holds the limits as JSON. Only
 * `PUT /api/admin/support-prompts/limits` writes it, so the generic settings
 * route refuses the key.
 */

import { parseSupportPromptLimits, type SupportPromptLimits } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { getSetting, setSetting } from "./site-settings.js";

/**
 * The `site_settings` key holding the limits.
 *
 * Exported so the generic settings route can refuse it.
 */
export const SUPPORT_PROMPT_LIMITS_KEY = "support_prompt_limits";

/** The component the log lines below are filed under. */
const LOG_COMPONENT = "SupportPromptLimits";

/**
 * Returns what bounds one reader across every prompt together.
 *
 * These are deliberately not per prompt. A ceiling each prompt could raise
 * bounds nothing, and with several prompts active a reader would otherwise see
 * their sum rather than the limit.
 *
 * A value that can no longer be read is replaced by its own default and the
 * others are kept, as `parseSupportPromptLimits` decides. Whatever is dropped
 * is logged, because a stored value that stopped being valid means a rule
 * changed under it. A stored text that is not JSON at all is logged too.
 *
 * @returns The stored limits, each field falling back on its own.
 */
export async function getSupportPromptLimits(): Promise<SupportPromptLimits> {
  const reading = parseSupportPromptLimits(await getSetting(SUPPORT_PROMPT_LIMITS_KEY));

  if (reading.unreadable) {
    log.warn(
      { component: LOG_COMPONENT, operation: "support_prompt_limits_read", key: SUPPORT_PROMPT_LIMITS_KEY },
      "support prompt limits are not readable, using defaults",
    );
  } else if (reading.dropped.length > 0) {
    log.warn(
      {
        component: LOG_COMPONENT,
        operation: "support_prompt_limits_read",
        key: SUPPORT_PROMPT_LIMITS_KEY,
        dropped: reading.dropped,
        kept: reading.limits,
      },
      "support prompt limits partly unreadable, kept what could be read",
    );
  }

  return reading.limits;
}

/**
 * Stores the limits.
 *
 * @param limits - The values to keep, already validated by the route.
 */
export async function putSupportPromptLimits(limits: SupportPromptLimits): Promise<void> {
  await setSetting(SUPPORT_PROMPT_LIMITS_KEY, JSON.stringify(limits));
}

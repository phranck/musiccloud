/**
 * @file The prompts a page hands to its island.
 *
 * Ported from lmaa.space (`apps/frontend/src/lib/support-prompts.ts`). lmaa
 * renders a prompt's Markdown here, on the site's server. musiccloud renders
 * Markdown in the backend, so the content arrives as sanitized HTML and this
 * only picks the prompts of one slot. The island only decides whether to show
 * one, because that decision needs the reader's own history and that lives in
 * their browser.
 */

import {
  type PublicSupportPrompt,
  SUPPORT_PROMPT_LIMIT_DEFAULTS,
  type SupportPromptLimits,
  type SupportPromptSlot,
} from "@musiccloud/shared";

import { fetchSupportPrompts } from "@/api/client";

/**
 * What a slot needs to draw at most one prompt.
 *
 * @property prompts - The prompts for this slot, in the order the server prefers them.
 * @property limits - What bounds one reader across every prompt together.
 * @property devAlwaysShow - Whether every limit is set aside, which only ever happens in
 *   development and in tests. The backend decides it; the site only follows.
 */
export interface SupportPromptSlotData {
  prompts: PublicSupportPrompt[];
  limits: SupportPromptLimits;
  devAlwaysShow: boolean;
}

/** Nothing to show, which is also the answer when the backend is unreachable. */
const EMPTY: SupportPromptSlotData = {
  prompts: [],
  // From the shared defaults rather than written out, so a limit added there is
  // not silently missing from the page that could not reach the backend.
  limits: SUPPORT_PROMPT_LIMIT_DEFAULTS,
  devAlwaysShow: false,
};

/**
 * Loads the prompts for one slot.
 *
 * A page that cannot reach the backend still renders, because a missing ask is
 * worth less than a broken page. The failure is swallowed deliberately and the
 * slot stays empty. It forgets nothing the reader's browser remembers, because
 * that store never drops a record for a prompt it was not sent.
 *
 * @param slot - The place asking.
 * @param clientIp - The visitor's address, forwarded for the backend's rate limit.
 * @returns The prompts for that slot, in the order the server prefers them.
 */
export async function loadSupportPrompts(slot: SupportPromptSlot, clientIp?: string): Promise<SupportPromptSlotData> {
  try {
    const payload = await fetchSupportPrompts(clientIp);
    return {
      prompts: payload.prompts.filter((prompt) => prompt.slot === slot),
      limits: payload.limits,
      devAlwaysShow: payload.devAlwaysShow ?? false,
    };
  } catch {
    return EMPTY;
  }
}

import { SupportPromptSlot } from "@/components/support/SupportPromptSlot";
import type { SupportPromptSlotData } from "@/lib/support/support-prompts";

/** Props of {@link LandingSupportPrompt}. */
interface LandingSupportPromptProps {
  /** The support prompts for the landing page, already loaded on the server. */
  supportPrompts: SupportPromptSlotData;
}

/**
 * The support prompt slot of the landing page.
 *
 * It stands in the flow below the search field, as wide as an embossed card on
 * the page. The landing page shows it only while nothing has been searched, so
 * it never sits between a reader and a result.
 *
 * @param props - See {@link LandingSupportPromptProps}.
 * @returns The slot.
 */
export function LandingSupportPrompt({ supportPrompts }: LandingSupportPromptProps) {
  return <SupportPromptSlot slot="landing-page" className="mt-6 w-full sm:max-w-lg" {...supportPrompts} />;
}

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
 * It stands in the flow directly under the search field, above the live
 * example, as wide as an embossed card on the page. The landing page shows it
 * only while nothing has been searched, as it does the live example, so it
 * never sits between a reader's search and what the search brings up. A
 * search that ends in a result replaces the whole branch the field stands in.
 *
 * @param props - See {@link LandingSupportPromptProps}.
 * @returns The slot.
 */
export function LandingSupportPrompt({ supportPrompts }: LandingSupportPromptProps) {
  return <SupportPromptSlot slot="landing-page" className="mt-6 w-full sm:max-w-lg" {...supportPrompts} />;
}

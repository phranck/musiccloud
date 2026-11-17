import { SupportPromptSlot } from "@/components/support/SupportPromptSlot";
import type { SupportPromptSlotData } from "@/lib/support/support-prompts";
import { TWO_COLUMN_TOTAL_W } from "./twoColumnGeometry";

/** Props of {@link ShareSupportPrompt}. */
interface ShareSupportPromptProps {
  /** The short id of the share page, which the visit is counted by. */
  shareId: string;
  /** The support prompts for a share page, already loaded on the server. */
  supportPrompts: SupportPromptSlotData;
}

/**
 * The support prompt slot of a share page, the commercial and the CC one alike.
 *
 * It stands above the result, between the logo and the result, in the flow of
 * the page and as wide as the result's two columns at most. It also counts the
 * visit, which it does whether or not a prompt follows.
 *
 * The space under the prompt belongs to the prompt rather than to this
 * wrapper, so a page without a prompt keeps the result exactly where it was.
 * It is the space the logo leaves above the result, so the result keeps the
 * same distance to whatever stands above it.
 *
 * @param props - See {@link ShareSupportPromptProps}.
 * @returns The slot.
 */
export function ShareSupportPrompt({ shareId, supportPrompts }: ShareSupportPromptProps) {
  return (
    <div className="w-full" style={{ maxWidth: TWO_COLUMN_TOTAL_W }}>
      <SupportPromptSlot slot="share-page" shareId={shareId} className="mb-4 sm:mb-6" {...supportPrompts} />
    </div>
  );
}

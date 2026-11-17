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
 * It stands after the result, in the flow of the page, as wide as the result's
 * two columns at most, so the ask follows what the reader came for rather than
 * standing between them and it. It also counts the visit, which it does
 * whether or not a prompt follows.
 *
 * @param props - See {@link ShareSupportPromptProps}.
 * @returns The slot.
 */
export function ShareSupportPrompt({ shareId, supportPrompts }: ShareSupportPromptProps) {
  return (
    <div className="mt-6 w-full" style={{ maxWidth: TWO_COLUMN_TOTAL_W }}>
      <SupportPromptSlot slot="share-page" shareId={shareId} {...supportPrompts} />
    </div>
  );
}

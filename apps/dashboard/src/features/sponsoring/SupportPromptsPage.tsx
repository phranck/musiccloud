import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { SUPPORT_PROMPT_LIMIT_DEFAULTS, SUPPORT_PROMPT_LIMITS, type SupportPromptLimits } from "@musiccloud/shared";
import { MegaphoneSimpleIcon, PlusCircleIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { SwitchGroup } from "@/components/ui/SwitchGroup";
import { dashboardCopy } from "@/copy/dashboard";
import { SupportPromptTable } from "@/features/sponsoring/SupportPromptTable";
import { NEW_SUPPORT_PROMPT_ID, supportPromptEditorPath } from "@/features/sponsoring/supportPromptPaths";
import {
  useSaveSupportPromptLimits,
  useSupportPromptLimits,
  useSupportPrompts,
} from "@/features/sponsoring/useSupportPrompts";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The support prompt screens' copy. */
const text = messages.sponsoring.supportPrompts;

/**
 * The browser store key under which this browser remembers whether the limits
 * stand open. Its value is `"true"` or `"false"`; absent, they stand closed.
 */
const LIMITS_EXPANDED_STORAGE_KEY = "support-prompts-limits-open";

/** How many placeholder rows stand in for the list while it loads: 5. */
const SKELETON_ROW_COUNT = 5;

/** The length of a day written as `YYYY-MM-DD`, the start of an ISO 8601 timestamp: 10 characters. */
const ISO_DAY_LENGTH = 10;

/**
 * Reads whether this browser left the limits open.
 *
 * @returns `true` when they were left open, `false` when closed or never touched.
 */
function readLimitsExpanded(): boolean {
  return localStorage.getItem(LIMITS_EXPANDED_STORAGE_KEY) === String(true);
}

/**
 * Lists the asks that appear inside the site, ported from lmaa.space's support
 * prompts page.
 *
 * The limits sit above the table and are pinned there, because they bound one
 * reader across every prompt together and no single prompt may raise them, so
 * they stop being findable once they scroll away. They save on their own with
 * the button in their header, which stays off until something changed. A
 * refused save shows the server's message with its code and error id.
 *
 * @returns The page.
 */
export function SupportPromptsPage() {
  const navigate = useNavigate();

  const { data: prompts, isLoading } = useSupportPrompts();
  const { data: limits } = useSupportPromptLimits();
  const saveLimits = useSaveSupportPromptLimits();
  const [draftLimits, setDraftLimits] = useState<SupportPromptLimits | null>(null);

  // Whether the limits stand open is a decision about this screen rather than
  // about the data, so it belongs to the browser it was made in.
  const [limitsExpanded, setLimitsExpanded] = useState(readLimitsExpanded);

  /**
   * Opens or closes the limits and remembers the choice in this browser.
   *
   * @param next - Whether they stand open afterwards.
   */
  function changeLimitsExpanded(next: boolean) {
    localStorage.setItem(LIMITS_EXPANDED_STORAGE_KEY, String(next));
    setLimitsExpanded(next);
  }

  const today = new Date().toISOString().slice(0, ISO_DAY_LENGTH);
  // The defaults come from the shared contract rather than being written out
  // again, so a limit added there is not missing here.
  const currentLimits = draftLimits ?? limits ?? SUPPORT_PROMPT_LIMIT_DEFAULTS;
  const promptCount = prompts?.length ?? 0;

  return (
    <PageLayout>
      <PageHeader title={text.title}>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={text.newPrompt}
          onClick={() => navigate(supportPromptEditorPath(NEW_SUPPORT_PROMPT_ID))}
          size="control"
          type="button"
        />
      </PageHeader>

      <PageBody className="overflow-y-auto">
        <DashboardSection
          expanded={limitsExpanded}
          onExpandedChange={changeLimitsExpanded}
          collapseButtonLabel={text.limitsTitle}
          className="sticky top-0 z-10 mb-4"
        >
          <DashboardSection.Header
            icon={<SlidersHorizontalIcon weight="duotone" className="size-4" />}
            title={text.limitsTitle}
            subtitle={text.limitsHint}
            renderAddOn={() => (
              <DashboardActionButton
                action={DashboardActionId.Save}
                label={saveLimits.isPending ? messages.common.saving : messages.common.save}
                status={saveLimits.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
                disabled={draftLimits === null || saveLimits.isPending}
                onClick={() => saveLimits.mutate(currentLimits, { onSuccess: () => setDraftLimits(null) })}
                size="control"
                type="button"
              />
            )}
          />
          <DashboardSection.Body>
            {/* Four in a row on a wide screen, because they are read as one
                set of rules rather than as two pairs. Two at the width where
                four would leave the hints too narrow to read. */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardInput
                id="support-prompt-max-shown"
                type="number"
                label={text.maxShownLabel}
                hint={text.maxShownHint}
                value={currentLimits.maxShown}
                min={SUPPORT_PROMPT_LIMITS.maxShownMin}
                max={SUPPORT_PROMPT_LIMITS.maxShownMax}
                onChange={(event) => setDraftLimits({ ...currentLimits, maxShown: Number(event.target.value) })}
              />
              <DashboardInput
                id="support-prompt-snooze-days"
                type="number"
                label={text.snoozeDaysLabel}
                hint={text.snoozeDaysHint}
                value={currentLimits.snoozeDays}
                min={SUPPORT_PROMPT_LIMITS.snoozeDaysMin}
                max={SUPPORT_PROMPT_LIMITS.snoozeDaysMax}
                onChange={(event) => setDraftLimits({ ...currentLimits, snoozeDays: Number(event.target.value) })}
              />
              <DashboardInput
                id="support-prompt-dismiss-snooze-days"
                type="number"
                label={text.dismissSnoozeDaysLabel}
                hint={text.dismissSnoozeDaysHint}
                value={currentLimits.dismissSnoozeDays}
                min={SUPPORT_PROMPT_LIMITS.snoozeDaysMin}
                max={SUPPORT_PROMPT_LIMITS.snoozeDaysMax}
                onChange={(event) =>
                  setDraftLimits({ ...currentLimits, dismissSnoozeDays: Number(event.target.value) })
                }
              />
              <DashboardInput
                id="support-prompt-dismissals-until-resolved"
                type="number"
                label={text.dismissalsUntilResolvedLabel}
                hint={text.dismissalsUntilResolvedHint}
                value={currentLimits.dismissalsUntilResolved}
                min={SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMin}
                max={SUPPORT_PROMPT_LIMITS.dismissalsUntilResolvedMax}
                onChange={(event) =>
                  setDraftLimits({ ...currentLimits, dismissalsUntilResolved: Number(event.target.value) })
                }
              />
            </div>
            {/* Only outside production, and the backend refuses to act on it
                there in any case, so a switch left on cannot reach a reader. */}
            {import.meta.env.DEV && (
              <SwitchGroup>
                <SwitchGroup.Item
                  id="support-prompt-dev-always-show"
                  label={text.devAlwaysShowLabel}
                  description={text.devAlwaysShowHint}
                  checked={currentLimits.devAlwaysShow}
                  onChange={(checked) => setDraftLimits({ ...currentLimits, devAlwaysShow: checked })}
                />
              </SwitchGroup>
            )}
            {saveLimits.isError && <SaveErrorMessage error={saveLimits.error} />}
          </DashboardSection.Body>
        </DashboardSection>

        {isLoading && (
          <div className="space-y-px">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => `skeleton-${index}`).map((key) => (
              <div
                key={key}
                className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]"
              />
            ))}
          </div>
        )}

        {!isLoading && promptCount === 0 && (
          <ContentUnavailableView
            icon={<MegaphoneSimpleIcon weight="duotone" aria-hidden />}
            title={text.emptyTitle}
            subtitle={text.emptyHint}
            className="flex-1 min-h-0"
          />
        )}

        {!isLoading && promptCount > 0 && (
          <div className="-mx-3">
            <SupportPromptTable
              prompts={prompts ?? []}
              today={today}
              onEdit={(prompt) => navigate(supportPromptEditorPath(prompt.id))}
            />
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}

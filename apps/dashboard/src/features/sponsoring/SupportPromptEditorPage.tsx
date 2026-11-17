import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import {
  ContentContext,
  ContentStatus,
  SUPPORT_PROMPT_BUTTON_ALIGNMENTS,
  SUPPORT_PROMPT_DEFAULTS,
  SUPPORT_PROMPT_LIMITS,
  SUPPORT_PROMPT_SLOTS,
  SUPPORT_PROMPT_THRESHOLD_BASES,
  type SupportPrompt,
  type SupportPromptInput,
} from "@musiccloud/shared";
import { CalendarBlankIcon, MegaphoneSimpleIcon, TextAaIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { EditorPageShell } from "@/components/ui/EditorPageShell";
import { LabeledSwitch } from "@/components/ui/LabeledSwitch";
import { SwitchLabelPosition } from "@/components/ui/labeledSwitchLayout";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { dashboardCopy } from "@/copy/dashboard";
import { useContentPages } from "@/features/content/hooks/useAdminContent";
import { RemoveConfirmDialog } from "@/features/sponsoring/RemoveConfirmDialog";
import {
  NEW_SUPPORT_PROMPT_ID,
  SUPPORT_PROMPTS_PATH,
  supportPromptEditorPath,
} from "@/features/sponsoring/supportPromptPaths";
import {
  useCreateSupportPrompt,
  useDeleteSupportPrompt,
  useSaveSupportPrompt,
  useSupportPrompts,
} from "@/features/sponsoring/useSupportPrompts";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The support prompt screens' copy. */
const text = messages.sponsoring.supportPrompts;

/** The Markdown editor's DOM id. */
const PROMPT_EDITOR_ID = "support-prompt-content";

/** The identity under which this browser remembers how tall the Markdown editor was dragged. */
const PROMPT_EDITOR_HEIGHT_KEY = "support-prompts:editor:content";

/** The Markdown editor's height before anybody drags it: 24rem. */
const PROMPT_EDITOR_HEIGHT = "24rem";

/** The slot a new prompt starts in, the first one the contract declares. */
const NEW_PROMPT_SLOT = SUPPORT_PROMPT_SLOTS[0];

/** The Markdown editor, loaded with the editor page rather than with the dashboard. */
const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })),
);

/** The slots as the slot dropdown offers them. */
const SLOT_OPTIONS = SUPPORT_PROMPT_SLOTS.map((slot) => ({ value: slot, label: text.slots[slot] }));

/** The counters as the counter dropdown offers them. */
const THRESHOLD_BASIS_OPTIONS = SUPPORT_PROMPT_THRESHOLD_BASES.map((basis) => ({
  value: basis,
  label: text.thresholdBases[basis],
}));

/** The button positions as the position dropdown offers them. */
const BUTTON_ALIGNMENT_OPTIONS = SUPPORT_PROMPT_BUTTON_ALIGNMENTS.map((alignment) => ({
  value: alignment,
  label: text.buttonAlignments[alignment],
}));

/**
 * The fields a new prompt starts with: the shared defaults, the given name,
 * and the first slot.
 *
 * @param name - What the new prompt is called until somebody renames it.
 * @returns The fields.
 */
function emptyPrompt(name: string): SupportPromptInput {
  return { ...SUPPORT_PROMPT_DEFAULTS, name, slot: NEW_PROMPT_SLOT };
}

/**
 * Turns a stored prompt back into the fields an editor works on.
 *
 * @param prompt - The prompt as the backend returned it.
 * @returns Its fields without the id and the moment of its last change.
 */
function toInput(prompt: SupportPrompt): SupportPromptInput {
  const { id: _id, updatedAt: _updatedAt, ...fields } = prompt;
  return fields;
}

/** Props of {@link ClearableDayField}. */
interface ClearableDayFieldProps {
  /** The input's id, which its label points at. */
  id: string;
  /** The label above the input. */
  label: string;
  /** The day as `YYYY-MM-DD`, or `null` for none. */
  value: string | null;
  /** Receives the chosen day, or `null` once it is cleared. */
  onChange: (value: string | null) => void;
}

/**
 * A day picker that can be emptied again, because an empty day means the
 * window has no limit on that side.
 *
 * The Clear button appears only while a day is set, as in lmaa.space's
 * clearable picker.
 *
 * @param props - See {@link ClearableDayFieldProps}.
 * @returns The field.
 */
function ClearableDayField({ id, label, value, onChange }: ClearableDayFieldProps) {
  return (
    <div className="flex items-end gap-2">
      <DashboardInput
        id={id}
        type="date"
        label={label}
        fieldClassName="flex-1 min-w-0"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
      {value && (
        <DashboardActionButton
          action={DashboardActionId.Close}
          label={messages.common.clear}
          size="control"
          type="button"
          onClick={() => onChange(null)}
        />
      )}
    </div>
  );
}

/**
 * The form for one prompt, grouped by subject, ported from lmaa.space's
 * support prompt editor.
 *
 * Where it appears, what it says, and when it runs are three different
 * questions, so they are three sections rather than one long column of fields.
 * The address segment `new` opens an empty prompt, which is created on save
 * and then reopened under its own id. Deleting asks first. A refused save or
 * deletion shows the server's message with its code and error id.
 *
 * @returns The page.
 */
export function SupportPromptEditorPage() {
  const navigate = useNavigate();
  const { promptId } = useParams<{ promptId: string }>();
  const isNew = promptId === NEW_SUPPORT_PROMPT_ID;

  const { data: prompts } = useSupportPrompts();
  const create = useCreateSupportPrompt();
  const save = useSaveSupportPrompt();
  const remove = useDeleteSupportPrompt();

  const stored = prompts?.find((prompt) => prompt.id === promptId) ?? null;
  const [draft, setDraft] = useState<SupportPromptInput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { phase: savedPhase, show: showSaved } = useSaveNotification();

  const fields = draft ?? (isNew ? emptyPrompt(text.newPrompt) : stored ? toInput(stored) : null);

  // Where the button leads is a page of this site, so it is chosen rather than
  // typed. A mistyped path is a dead button that nobody notices. A page counts
  // when it is published on the site the prompts appear on, at the path it is
  // published under there.
  const { data: pages } = useContentPages();
  const pageOptions = useMemo<DropdownOption[]>(
    () =>
      (pages ?? []).flatMap((page) => {
        const publication = page.publications.find(
          (candidate) => candidate.context === ContentContext.Frontend && candidate.status === ContentStatus.Published,
        );
        return publication ? [{ value: publication.path, label: `${page.title} · ${publication.path}` }] : [];
      }),
    [pages],
  );

  /**
   * Changes some fields of the form.
   *
   * @param patch - The fields to change.
   */
  function update(patch: Partial<SupportPromptInput>) {
    if (!fields) return;
    setDraft({ ...fields, ...patch });
  }

  /** Creates the new prompt and reopens it under its id, or saves the stored one in place. */
  function handleSave() {
    if (!fields) return;
    if (isNew) {
      create.mutate(fields, {
        onSuccess: (prompt) => {
          setDraft(null);
          navigate(supportPromptEditorPath(prompt.id), { replace: true });
        },
      });
      return;
    }
    if (!promptId) return;
    save.mutate(
      { id: promptId, input: fields },
      {
        onSuccess: () => {
          setDraft(null);
          showSaved();
        },
      },
    );
  }

  const isPending = create.isPending || save.isPending || remove.isPending;
  const saveError = create.error ?? save.error;

  return (
    <>
      <EditorPageShell
        title={fields?.name ?? text.title}
        backLabel={text.title}
        onBack={() => navigate(SUPPORT_PROMPTS_PATH)}
        noCard
        headerContent={
          <div className="flex items-center gap-3">
            <SaveNotification phase={savedPhase} label={messages.common.saved} />
            {!isNew && (
              <DashboardActionButton
                action={DashboardActionId.Delete}
                label={messages.common.delete}
                disabled={isPending}
                onClick={() => {
                  remove.reset();
                  setConfirmDelete(true);
                }}
                size="control"
                type="button"
              />
            )}
            <DashboardActionButton
              action={DashboardActionId.Save}
              label={isPending ? messages.common.saving : messages.common.save}
              status={isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
              disabled={!fields || isPending}
              onClick={handleSave}
              size="control"
              type="button"
            />
          </div>
        }
      >
        {fields && (
          <div className="space-y-4">
            {saveError && <SaveErrorMessage error={saveError} />}

            <DashboardSection>
              <DashboardSection.Header
                icon={<MegaphoneSimpleIcon weight="duotone" className="size-4" />}
                title={text.placementTitle}
                subtitle={text.placementHint}
              />
              <DashboardSection.Body>
                <div className="grid gap-4 md:grid-cols-2">
                  <DashboardInput
                    id="support-prompt-name"
                    label={text.nameLabel}
                    placeholder={text.namePlaceholder}
                    value={fields.name}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                  <Dropdown
                    label={text.slotLabel}
                    value={fields.slot}
                    options={SLOT_OPTIONS}
                    onChange={(slot) => update({ slot })}
                  />
                  {/* The number and what it counts are one question, so they
                      share a row. The counter takes only the width of its own
                      words. */}
                  <div className="flex items-start gap-3">
                    <DashboardInput
                      id="support-prompt-threshold"
                      type="number"
                      label={text.thresholdLabel}
                      hint={text.thresholdHint}
                      fieldClassName="flex-1 min-w-0"
                      value={fields.threshold}
                      min={SUPPORT_PROMPT_LIMITS.thresholdMin}
                      max={SUPPORT_PROMPT_LIMITS.thresholdMax}
                      onChange={(event) => update({ threshold: Number(event.target.value) })}
                    />
                    <Dropdown
                      label={text.thresholdBasisLabel}
                      value={fields.thresholdBasis}
                      options={THRESHOLD_BASIS_OPTIONS}
                      className="shrink-0"
                      onChange={(thresholdBasis) => update({ thresholdBasis })}
                    />
                  </div>
                  <DashboardInput
                    id="support-prompt-priority"
                    type="number"
                    label={text.priorityLabel}
                    hint={text.priorityHint}
                    value={fields.priority}
                    min={SUPPORT_PROMPT_LIMITS.priorityMin}
                    max={SUPPORT_PROMPT_LIMITS.priorityMax}
                    onChange={(event) => update({ priority: Number(event.target.value) })}
                  />
                </div>
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection>
              <DashboardSection.Header
                icon={<TextAaIcon weight="duotone" className="size-4" />}
                title={text.contentLabel}
                subtitle={text.contentHint}
              />
              <DashboardSection.Body>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* The caption and where it stands are two answers about the
                      same button, so they share a row. The position takes only
                      the width of its own words, because a control as wide as a
                      text field promises more to type than three choices. */}
                  <div className="flex items-start gap-3">
                    <DashboardInput
                      id="support-prompt-button-label"
                      label={text.buttonLabel}
                      fieldClassName="flex-1 min-w-0"
                      value={fields.buttonLabel}
                      onChange={(event) => update({ buttonLabel: event.target.value })}
                    />
                    <Dropdown
                      label={text.buttonAlignmentLabel}
                      value={fields.buttonAlignment}
                      options={BUTTON_ALIGNMENT_OPTIONS}
                      className="shrink-0"
                      onChange={(buttonAlignment) => update({ buttonAlignment })}
                    />
                  </div>
                  <Dropdown
                    label={text.buttonHrefLabel}
                    value={fields.buttonHref}
                    options={pageOptions}
                    onChange={(buttonHref) => update({ buttonHref })}
                  />
                </div>
                <Suspense fallback={<div className="h-64 animate-pulse bg-[var(--ds-input-bg)]" />}>
                  <MarkdownEditor
                    key={promptId}
                    id={PROMPT_EDITOR_ID}
                    value={fields.content}
                    onChange={(content) => update({ content })}
                    height={PROMPT_EDITOR_HEIGHT}
                    resizable
                    storageKey={PROMPT_EDITOR_HEIGHT_KEY}
                  />
                </Suspense>
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection>
              <DashboardSection.Header
                icon={<CalendarBlankIcon weight="duotone" className="size-4" />}
                title={text.scheduleTitle}
                subtitle={text.windowHint}
                renderAddOn={() => (
                  <LabeledSwitch
                    id="support-prompt-published"
                    label={text.publishedLabel}
                    labelPosition={SwitchLabelPosition.Right}
                    checked={fields.published}
                    onChange={(published) => update({ published })}
                  />
                )}
              />
              <DashboardSection.Body>
                <div className="grid gap-4 md:grid-cols-2">
                  <ClearableDayField
                    id="support-prompt-starts-at"
                    label={text.startsAtLabel}
                    value={fields.startsAt}
                    onChange={(startsAt) => update({ startsAt })}
                  />
                  <ClearableDayField
                    id="support-prompt-ends-at"
                    label={text.endsAtLabel}
                    value={fields.endsAt}
                    onChange={(endsAt) => update({ endsAt })}
                  />
                </div>
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        )}
      </EditorPageShell>

      <RemoveConfirmDialog
        summary={confirmDelete ? (fields?.name ?? "") : null}
        title={text.deleteTitle}
        description={text.deleteMessage}
        confirmLabel={messages.common.delete}
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!promptId) return;
          remove.mutate(promptId, { onSuccess: () => navigate(SUPPORT_PROMPTS_PATH) });
        }}
      />
    </>
  );
}

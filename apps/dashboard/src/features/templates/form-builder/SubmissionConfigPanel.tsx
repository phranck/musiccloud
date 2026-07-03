import { closestCenter, DndContext, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DashboardIconButton,
  DashboardInput,
  DashboardSegmentedControl,
} from "@musiccloud/dashboard-ui";
import {
  type SubmissionConfig,
  type SubmissionStep,
  type SubmissionStepEmail,
  SubmissionStepType,
} from "@musiccloud/shared";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  EnvelopeOpenIcon,
  ListIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { FlowConnector } from "@/components/ui/FlowConnector";
import { FlowDirection } from "@/components/ui/flowDirection";
import { useI18n } from "@/context/I18nContext";
import { useEmailTemplates } from "@/features/templates/hooks/useEmailTemplates";
import { useDashboardSortableSensors } from "@/lib/useDashboardSortableSensors";
import { FormLabel, formInputClass } from "@/shared/ui/FormPrimitives";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

interface SubmissionConfigPanelProps {
  config: SubmissionConfig | undefined;
  onChange: (config: SubmissionConfig | undefined) => void;
  /** Available form fields for dynamic recipient/reply-to selection (same shape as FieldConfigPanel.allFields). */
  fields: { id: string; label: string }[];
}

/** Value namespace for the success-behaviour mode discriminant (message screen vs. redirect). */
const SuccessMode = {
  Message: "message",
  Redirect: "redirect",
} as const;

/** Stable empty chain for forms without a submission config (module-level so `cfg` stays referentially stable across renders; never mutated, only spread). */
const EMPTY_SUBMISSION_CONFIG: SubmissionConfig = { steps: [] };

/** Normalises an absent config to the stable empty chain for editing. */
function ensureConfig(config: SubmissionConfig | undefined): SubmissionConfig {
  return config ?? EMPTY_SUBMISSION_CONFIG;
}

type SubmissionMessages = ReturnType<typeof useI18n>["messages"]["formBuilder"]["submission"];

/** Localised card title per step type. */
function stepTitle(step: SubmissionStep, m: SubmissionMessages): string {
  return step.type === SubmissionStepType.Store ? m.stepStore : m.stepEmail;
}

// ---------------------------------------------------------------------------
// Step editor sub-components
// ---------------------------------------------------------------------------

interface StepRowProps {
  sortableId: string;
  index: number;
  step: SubmissionStep;
  onUpdate: (updated: SubmissionStep) => void;
  onRemove: () => void;
  fields: { id: string; label: string }[];
  templates: { id: number; name: string }[];
}

/**
 * One horizontally sortable pipeline-step card. `store` needs no settings;
 * `email` exposes the recipient (fixed address or a form field), the optional
 * reply-to field, the template picker, and — template-less only — a subject.
 */
function StepRow({ sortableId, index, step, onUpdate, onRemove, fields, templates }: StepRowProps) {
  const { messages } = useI18n();
  const m = messages.formBuilder.submission;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-48 flex-col gap-2 rounded-control border border-[var(--ds-border)] bg-[var(--ds-form-control-bg)] px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <DashboardIconButton
            type="button"
            {...attributes}
            {...listeners}
            className="touch-none cursor-grab active:cursor-grabbing"
            title={m.stepMoveAria}
            aria-label={m.stepMoveAria}
            variant={DashboardButtonVariant.Ghost}
          >
            <ListIcon weight="bold" className="size-4" />
          </DashboardIconButton>
          <span className="truncate text-sm font-medium text-[var(--ds-text)]">{stepTitle(step, m)}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-[var(--ds-text-muted)] hover:text-[var(--ds-danger-text)]"
          aria-label={m.stepRemoveAria}
        >
          <TrashIcon weight="duotone" className="size-3.5" />
        </button>
      </div>

      {step.type === SubmissionStepType.Email && (
        <EmailStepFields index={index} step={step} onUpdate={onUpdate} fields={fields} templates={templates} m={m} />
      )}
    </div>
  );
}

interface EmailStepFieldsProps {
  index: number;
  step: SubmissionStepEmail;
  onUpdate: (updated: SubmissionStep) => void;
  fields: { id: string; label: string }[];
  templates: { id: number; name: string }[];
  m: SubmissionMessages;
}

/** The email step's settings block (recipient mode, reply-to, template, subject). */
function EmailStepFields({ index, step, onUpdate, fields, templates, m }: EmailStepFieldsProps) {
  return (
    <>
      <div>
        <span className="mb-1 block text-xs text-[var(--ds-text-muted)]">{m.emailTo}</span>
        <DashboardSegmentedControl
          aria-label={m.emailTo}
          className="mb-1.5"
          value={step.toFieldId ? "field" : "static"}
          onValueChange={(val) => onUpdate({ ...step, toFieldId: val === "field" ? (fields[0]?.id ?? "") : undefined })}
          options={[
            { value: "static", label: m.emailToStatic },
            { value: "field", label: m.emailToFromField, disabled: fields.length === 0 },
          ]}
        />
        {step.toFieldId ? (
          <select
            id={`step-${index}-email-to-field`}
            aria-label={m.emailToFromField}
            value={step.toFieldId}
            onChange={(e) => onUpdate({ ...step, toFieldId: e.target.value })}
            className={formInputClass}
          >
            <option value="">—</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        ) : (
          <DashboardInput
            id={`step-${index}-email-to`}
            type="email"
            value={step.to}
            onChange={(e) => onUpdate({ ...step, to: e.target.value })}
            placeholder="admin@example.com"
          />
        )}
      </div>

      <div>
        <label htmlFor={`step-${index}-email-reply-to`} className="mb-1 block text-xs text-[var(--ds-text-muted)]">
          {m.emailReplyTo}
        </label>
        <select
          id={`step-${index}-email-reply-to`}
          value={step.replyToFieldId ?? ""}
          onChange={(e) => onUpdate({ ...step, replyToFieldId: e.target.value || undefined })}
          className={formInputClass}
        >
          <option value="">{m.emailReplyToNone}</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`step-${index}-email-template`} className="mb-1 block text-xs text-[var(--ds-text-muted)]">
          {m.emailTemplate}
        </label>
        <select
          id={`step-${index}-email-template`}
          value={String(step.templateId ?? "")}
          onChange={(e) => onUpdate({ ...step, templateId: e.target.value ? Number(e.target.value) : undefined })}
          className={formInputClass}
        >
          <option value="">{m.emailTemplateNone}</option>
          {templates.map((template) => (
            <option key={template.id} value={String(template.id)}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {!step.templateId && (
        <div>
          <label htmlFor={`step-${index}-email-subject`} className="mb-1 block text-xs text-[var(--ds-text-muted)]">
            {m.emailSubject}
          </label>
          <DashboardInput
            id={`step-${index}-email-subject`}
            value={step.subject ?? ""}
            onChange={(e) => onUpdate({ ...step, subject: e.target.value || undefined })}
            placeholder={m.emailSubjectPlaceholder}
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * Panel for configuring a form's submission chain (ported from lmaa.space,
 * minus its shop step): a horizontally sortable step pipeline (store / email)
 * plus the success behaviour (message + headline, or redirect). An entirely
 * empty configuration collapses back to `undefined` so unconfigured forms
 * store no submission config at all.
 */
export function SubmissionConfigPanel({ config, onChange, fields }: SubmissionConfigPanelProps) {
  const { messages } = useI18n();
  const m = messages.formBuilder.submission;
  const { data: templates } = useEmailTemplates();

  const cfg = ensureConfig(config);

  // Stable UUIDs per step — independent of position, prevents ghost artifacts
  // after DnD. Genuine state (identity must survive reorders), but its LENGTH
  // follows cfg.steps: synced during render (adjust-state-during-render
  // idiom, see EmailTemplateEditPage) instead of via a lagging useEffect.
  const [uids, setUids] = useState<string[]>(() => cfg.steps.map(() => crypto.randomUUID()));
  if (uids.length !== cfg.steps.length) {
    setUids(
      cfg.steps.length > uids.length
        ? [...uids, ...Array.from({ length: cfg.steps.length - uids.length }, () => crypto.randomUUID())]
        : uids.slice(0, cfg.steps.length),
    );
  }

  const updateSteps = useCallback(
    (steps: SubmissionStep[], nextUids?: string[]) => {
      if (nextUids) setUids(nextUids);
      onChange(steps.length === 0 && !cfg.successMessage && !cfg.successRedirectUrl ? undefined : { ...cfg, steps });
    },
    [cfg, onChange],
  );

  const addStep = useCallback(
    (type: SubmissionStep["type"]) => {
      const newStep: SubmissionStep =
        type === SubmissionStepType.Store
          ? { type: SubmissionStepType.Store }
          : { type: SubmissionStepType.Email, to: "" };
      updateSteps([...cfg.steps, newStep], [...uids, crypto.randomUUID()]);
    },
    [cfg.steps, uids, updateSteps],
  );

  function updateStep(index: number, updated: SubmissionStep) {
    updateSteps(cfg.steps.map((s, i) => (i === index ? updated : s)));
  }

  function removeStep(index: number) {
    updateSteps(
      cfg.steps.filter((_, i) => i !== index),
      uids.filter((_, i) => i !== index),
    );
  }

  function reorderSteps(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = uids.indexOf(String(active.id));
    const newIndex = uids.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) {
      updateSteps(arrayMove(cfg.steps, oldIndex, newIndex), arrayMove(uids, oldIndex, newIndex));
    }
  }

  const [pendingStepType, setPendingStepType] = useState<SubmissionStep["type"]>(SubmissionStepType.Store);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const activeStep = activeUid !== null ? (cfg.steps[uids.indexOf(activeUid)] ?? null) : null;

  const sensors = useDashboardSortableSensors({ activationDistance: 6 });
  const sortableIds = uids.slice(0, cfg.steps.length);

  function handleDragStart(event: DragStartEvent) {
    setActiveUid(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveUid(null);
    reorderSteps(event);
  }

  function updateField(key: "successHeadline" | "successMessage" | "successRedirectUrl", value: string) {
    const next = { ...cfg, [key]: value || undefined };
    if (next.steps.length === 0 && !next.successMessage && !next.successRedirectUrl) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  }

  // Memoized header add-ons: DashboardSection.Header's addOn prop takes an
  // already-constructed ReactNode; memoizing avoids handing it fresh JSX on
  // every render.
  const addStepControl = useMemo(
    () => (
      <div className="flex items-center gap-1.5">
        <select
          aria-label={m.addStep}
          value={pendingStepType}
          onChange={(e) => setPendingStepType(e.target.value as SubmissionStep["type"])}
          className={formInputClass}
        >
          <option value={SubmissionStepType.Store}>{m.stepStore}</option>
          <option value={SubmissionStepType.Email}>{m.stepEmail}</option>
        </select>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={
            pendingStepType === SubmissionStepType.Store ? (
              <DownloadIcon weight="duotone" className="size-3.5" aria-hidden />
            ) : (
              <EnvelopeOpenIcon weight="duotone" className="size-3.5" aria-hidden />
            )
          }
          label={m.addStepButton}
          onClick={() => addStep(pendingStepType)}
          size="action"
          type="button"
        />
      </div>
    ),
    [m, pendingStepType, addStep],
  );

  const successModeOptions = useMemo(
    () => [
      {
        value: SuccessMode.Message,
        label: m.successMessage,
        icon: <CheckIcon weight="duotone" className="size-3.5" aria-hidden />,
      },
      {
        value: SuccessMode.Redirect,
        label: m.successRedirect,
        icon: <ArrowRightIcon weight="duotone" className="size-3.5" aria-hidden />,
      },
    ],
    [m],
  );

  const successModeControl = useMemo(
    () => (
      <DashboardSegmentedControl
        aria-label={m.successBehaviourLabel}
        value={cfg.successRedirectUrl !== undefined ? SuccessMode.Redirect : SuccessMode.Message}
        onValueChange={(mode) => {
          if (mode === SuccessMode.Redirect) {
            const next = {
              ...cfg,
              successRedirectUrl: cfg.successRedirectUrl ?? "",
              successHeadline: undefined,
              successMessage: undefined,
            };
            onChange(next.steps.length === 0 && !next.successRedirectUrl ? undefined : next);
          } else {
            const next = { ...cfg, successMessage: cfg.successMessage ?? "", successRedirectUrl: undefined };
            onChange(next.steps.length === 0 && !next.successMessage ? undefined : next);
          }
        }}
        options={successModeOptions}
      />
    ),
    [cfg, m.successBehaviourLabel, onChange, successModeOptions],
  );

  return (
    <div>
      <DashboardSection>
        <DashboardSection.Header
          icon={<PaperPlaneTiltIcon weight="duotone" className="size-4" />}
          title={m.title}
          addOn={addStepControl}
        />
        <DashboardSection.Body>
          {cfg.steps.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-muted)]">{m.noSteps}</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveUid(null)}
            >
              <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-row flex-wrap items-start gap-y-2">
                  {cfg.steps.map((step, i) => (
                    <div key={uids[i]} className="flex items-start">
                      <StepRow
                        sortableId={uids[i]}
                        index={i}
                        step={step}
                        onUpdate={(updated) => updateStep(i, updated)}
                        onRemove={() => removeStep(i)}
                        fields={fields}
                        templates={templates ?? []}
                      />
                      {i < cfg.steps.length - 1 && <FlowConnector direction={FlowDirection.Horizontal} />}
                    </div>
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeStep && (
                  <div className="flex min-w-48 cursor-grabbing flex-col gap-2 rounded-control border border-[var(--color-primary)] bg-[var(--ds-form-control-bg)] px-3 py-2.5 opacity-95 shadow-xl">
                    <span className="text-sm font-medium text-[var(--ds-text)]">{stepTitle(activeStep, m)}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </DashboardSection.Body>
      </DashboardSection>

      <FlowConnector />

      <DashboardSection>
        <DashboardSection.Header
          icon={<CheckCircleIcon weight="duotone" className="size-4" />}
          title={m.successBehaviourLabel}
          addOn={successModeControl}
        />
        {cfg.successRedirectUrl !== undefined ? (
          <DashboardSection.Body>
            <DashboardInput
              id="submission-success-redirect"
              type="url"
              value={cfg.successRedirectUrl}
              onChange={(e) => updateField("successRedirectUrl", e.target.value)}
              placeholder="https://example.com/danke"
            />
          </DashboardSection.Body>
        ) : (
          <>
            <DashboardSection.Body>
              <div>
                <FormLabel htmlFor="submission-success-headline">{m.successHeadline}</FormLabel>
                <DashboardInput
                  id="submission-success-headline"
                  value={cfg.successHeadline ?? ""}
                  onChange={(e) => updateField("successHeadline", e.target.value)}
                  placeholder={m.successHeadlinePlaceholder}
                />
              </div>
              <FormLabel htmlFor="submission-success-message">{m.successText}</FormLabel>
            </DashboardSection.Body>
            <Suspense
              fallback={
                <div className="h-24 animate-pulse rounded-b-xl border-t border-[var(--ds-border)] bg-[var(--ds-input-bg)]" />
              }
            >
              {/* `bare` drops the editor's own border so it embeds gaplessly as the section's bottom edge. */}
              <MarkdownEditor
                id="submission-success-message"
                value={cfg.successMessage ?? ""}
                onChange={(value) => updateField("successMessage", value)}
                placeholder={m.successMessagePlaceholder}
                rows={4}
                bare
                className="rounded-b-xl border-t border-[var(--ds-border)]"
              />
            </Suspense>
          </>
        )}
      </DashboardSection>
    </div>
  );
}

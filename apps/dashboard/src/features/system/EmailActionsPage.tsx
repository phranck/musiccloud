import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButton,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { LightningIcon, PlusCircleIcon, TagIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import type { EmailActionBinding, EmailActionWithBindings } from "@/features/templates/hooks/useEmailActions";
import {
  useCreateBinding,
  useDeleteBinding,
  useEmailActions,
  useToggleBinding,
} from "@/features/templates/hooks/useEmailActions";
import { useEmailTemplates } from "@/features/templates/hooks/useEmailTemplates";
import { formInputClass } from "@/shared/ui/FormPrimitives";

/**
 * System page (`/actions`) for binding email templates to code-defined
 * system actions (`EMAIL_ACTIONS` in `@musiccloud/shared`).
 *
 * An action is a named event in the system (e.g. "admin invite sent") that
 * fires with a fixed set of template variables when it happens. The action
 * set itself is fixed in code — this page only manages the admin-editable
 * many-to-many bindings between an action and the templates it should fan
 * out to. Replaces the old per-invite "welcome template" picker: instead of
 * choosing a template at invite time, the admin now declares up front which
 * template(s) the `adminInviteSent` action sends.
 *
 * Layout: a left list of every action (label + a "Required" badge when the
 * action has no permissive fallback) and a right detail pane for whichever
 * action is currently selected, showing its variables, its bound templates
 * (each togglable and removable), and a control to bind another template.
 * The list always renders every action returned by the backend — nothing
 * here assumes there is exactly one action, even though `EMAIL_ACTIONS`
 * currently only defines `adminInviteSent`.
 */
export function EmailActionsPage() {
  const { messages } = useI18n();
  const m = messages.emailActions;
  const common = messages.common;

  const { data: actions, isLoading } = useEmailActions();
  const { data: templates = [] } = useEmailTemplates();

  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);

  // Select the first action once the list first loads, without fighting a
  // later user selection on background refetch (mirrors EmailBrandingPage's
  // syncedRef idiom: the ref guards a one-time seed, not every render).
  const syncedRef = useRef(false);
  if (actions && actions.length > 0 && !syncedRef.current) {
    syncedRef.current = true;
    setSelectedActionKey(actions[0].key);
  }

  const selectedAction = actions?.find((action) => action.key === selectedActionKey) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--ds-text-muted)] text-sm">{common.loading}</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={m.title} />

      <div className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(16rem,0.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 overflow-y-auto">
            <ActionListSection
              actions={actions ?? []}
              selectedKey={selectedActionKey}
              onSelect={setSelectedActionKey}
              labels={m}
            />
          </div>

          <div className="min-w-0 overflow-y-auto">
            {selectedAction ? (
              <ActionDetailSection action={selectedAction} templates={templates} labels={m} />
            ) : (
              <div className="flex items-center justify-center h-64 text-[var(--ds-text-muted)] text-sm">
                {m.noActionSelected}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** This page's i18n message block, reused as a prop type by every sub-component below (mirrors `EmailTemplateEditPage`'s `labels` prop convention). */
type EmailActionsLabels = ReturnType<typeof useI18n>["messages"]["emailActions"];

/** The subset of `EmailTemplate` this page ever needs: enough to list and pick a template by id, never its body/blocks. */
type TemplateOption = { id: number; name: string };

interface ActionListSectionProps {
  actions: EmailActionWithBindings[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  labels: EmailActionsLabels;
}

/** Left pane: one row per code-defined action, selectable. */
function ActionListSection({ actions, selectedKey, onSelect, labels }: ActionListSectionProps) {
  return (
    <DashboardSection>
      <DashboardSection.Header icon={<LightningIcon weight="duotone" className="size-4" />} title={labels.title} />
      <DashboardSection.Body flush>
        {actions.map((action) => (
          <ActionListRow
            key={action.key}
            action={action}
            isSelected={action.key === selectedKey}
            onSelect={onSelect}
            labels={labels}
          />
        ))}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

interface ActionListRowProps {
  action: EmailActionWithBindings;
  isSelected: boolean;
  onSelect: (key: string) => void;
  labels: EmailActionsLabels;
}

/**
 * One selectable action row. The "Required" badge is memoized rather than
 * built inline in {@link ActionListSection}'s `.map()` callback, since
 * `DashboardSection.Item`'s `addOn` prop only accepts an already-constructed
 * `ReactNode` (no `renderAddOn` deferred-construction alternative, unlike its
 * sibling `DashboardSection.Header`) — memoizing here avoids handing a
 * freshly-allocated element to that prop on every render.
 */
function ActionListRow({ action, isSelected, onSelect, labels }: ActionListRowProps) {
  const badge = useMemo(
    () =>
      action.required ? (
        <span className="px-2 py-0.5 rounded text-xs bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)]">
          {labels.requiredBadge}
        </span>
      ) : undefined,
    [action.required, labels.requiredBadge],
  );

  return (
    <DashboardSection.Item
      icon={<LightningIcon weight="duotone" className="size-4" />}
      label={action.label}
      active={isSelected}
      onClick={() => onSelect(action.key)}
      addOn={badge}
    />
  );
}

interface ActionDetailSectionProps {
  action: EmailActionWithBindings;
  templates: TemplateOption[];
  labels: EmailActionsLabels;
}

/** Right pane: variables, bound templates (toggle/remove), and the assign-template control. */
function ActionDetailSection({ action, templates, labels }: ActionDetailSectionProps) {
  return (
    <div className="space-y-4">
      <DashboardSection>
        <DashboardSection.Header icon={<TagIcon weight="duotone" className="size-4" />} title={labels.variablesTitle} />
        <DashboardSection.Body>
          <div className="space-y-2">
            {action.contextVariables.length === 0 ? (
              <p className="text-xs text-[var(--ds-text-muted)]">{labels.variablesNone}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {action.contextVariables.map((name) => (
                  <code
                    key={name}
                    className="shrink-0 rounded bg-[var(--ds-bg-elevated)] px-1.5 py-0.5 font-mono text-xs text-[var(--ds-text)]"
                  >
                    {`{{${name}}}`}
                  </code>
                ))}
              </div>
            )}
            <p className="text-xs text-[var(--ds-text-subtle)]">{labels.variablesContextHint}</p>
          </div>
        </DashboardSection.Body>
      </DashboardSection>

      <DashboardSection>
        <DashboardSection.Header
          icon={<LightningIcon weight="duotone" className="size-4" />}
          title={labels.boundTemplatesTitle}
        />
        <DashboardSection.Body>
          <BoundTemplatesList action={action} templates={templates} labels={labels} />
          <AssignTemplateControl action={action} templates={templates} labels={labels} />
        </DashboardSection.Body>
      </DashboardSection>
    </div>
  );
}

interface BoundTemplatesListProps {
  action: EmailActionWithBindings;
  templates: TemplateOption[];
  labels: EmailActionsLabels;
}

/** One row per binding: bound template's name (or a fallback if since-deleted), an enable/disable toggle, and a remove button. */
function BoundTemplatesList({ action, templates, labels }: BoundTemplatesListProps) {
  const toggleMutation = useToggleBinding();
  const deleteMutation = useDeleteBinding();

  if (action.bindings.length === 0) {
    return <p className="text-sm text-[var(--ds-text-muted)]">{labels.noTemplateBound}</p>;
  }

  return (
    <div className="space-y-2">
      {action.bindings.map((binding) => (
        <BoundTemplateRow
          key={binding.id}
          binding={binding}
          templateName={templates.find((t) => t.id === binding.templateId)?.name}
          fallbackName={labels.deletedTemplateFallback}
          onToggle={(enabled) => toggleMutation.mutate({ id: binding.id, enabled })}
          onRemove={() => deleteMutation.mutate(binding.id)}
        />
      ))}
    </div>
  );
}

interface BoundTemplateRowProps {
  binding: EmailActionBinding;
  templateName: string | undefined;
  fallbackName: string;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}

/** One bound-template row: name (or `fallbackName` if the template was since deleted), an enable/disable toggle, and a remove button. */
function BoundTemplateRow({ binding, templateName, fallbackName, onToggle, onRemove }: BoundTemplateRowProps) {
  const { messages } = useI18n();

  return (
    <div className="flex items-center gap-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface-inset)] px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-mono text-[var(--ds-text)]">
        {templateName ?? fallbackName}
      </span>
      <DashboardButton
        type="button"
        size="control"
        onClick={() => onToggle(!binding.enabled)}
        variant={binding.enabled ? DashboardButtonVariant.Success : DashboardButtonVariant.Neutral}
      >
        {/* Reuses the generic enabled/disabled wording from the services feature (messages.services) rather than a new emailActions-scoped pair — same plain "Enabled"/"Disabled" semantics, no plugin-specific meaning baked in. */}
        {binding.enabled ? messages.services.enabled : messages.services.disabled}
      </DashboardButton>
      <DashboardActionButton
        action={DashboardActionId.Remove}
        iconOnly
        label={messages.common.remove}
        onClick={onRemove}
        size="control"
        type="button"
      />
    </div>
  );
}

interface AssignTemplateControlProps {
  action: EmailActionWithBindings;
  templates: Array<{ id: number; name: string }>;
  labels: EmailActionsLabels;
}

/**
 * "+ assign template" control: a native `<select>` of every template not yet
 * bound to this action, plus an assign button. The backend's compatibility
 * check (a template using a `{{var}}` the action doesn't supply — auto-extracted
 * from the template's subject + body) surfaces as the mutation's `error`, shown
 * inline near the control rather than assumed to always succeed.
 */
function AssignTemplateControl({ action, templates, labels }: AssignTemplateControlProps) {
  const createMutation = useCreateBinding();
  const boundTemplateIds = new Set(action.bindings.map((binding) => binding.templateId));
  const availableTemplates = templates.filter((tpl) => !boundTemplateIds.has(tpl.id));
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | "">("");

  function handleAssign() {
    if (selectedTemplateId === "") return;
    createMutation.mutate(
      { actionKey: action.key, templateId: selectedTemplateId },
      { onSuccess: () => setSelectedTemplateId("") },
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--ds-border-subtle)] pt-3">
      <div className="flex items-center gap-2">
        <select
          aria-label={labels.assignTemplateTitle}
          value={selectedTemplateId}
          onChange={(e) => {
            setSelectedTemplateId(e.target.value ? Number(e.target.value) : "");
            // Clear a stale compatibility error from a previous attempt once
            // the admin picks a different template (mirrors DesignSettingsPage's
            // handleChange, which resets its save mutation on the next edit).
            if (createMutation.isError) createMutation.reset();
          }}
          className={formInputClass}
          disabled={availableTemplates.length === 0}
        >
          <option value="">
            {availableTemplates.length === 0 ? labels.assignTemplateNoOptions : labels.assignTemplatePlaceholder}
          </option>
          {availableTemplates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <DashboardActionButton
          action={DashboardActionId.Create}
          disabled={selectedTemplateId === "" || createMutation.isPending}
          icon={<PlusCircleIcon weight="duotone" className="size-3.5" />}
          label={labels.assignTemplateAction}
          onClick={handleAssign}
          size="control"
          type="button"
        />
      </div>
      {createMutation.isError && (
        <p className="text-xs text-red-500">
          {createMutation.error instanceof Error ? createMutation.error.message : labels.bindErrorFallback}
        </p>
      )}
    </div>
  );
}

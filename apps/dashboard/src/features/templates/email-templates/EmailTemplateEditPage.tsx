import {
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
  DashboardInput,
  SaveActionButton,
} from "@musiccloud/dashboard-ui";
import type { EmailBlock } from "@musiccloud/shared";
import { ArticleIcon, CheckCircleIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, TagIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import { BlockEditor } from "@/features/templates/email-templates/BlockEditor";
import { EmailPreview } from "@/features/templates/email-templates/EmailPreview";
import { collectGradientSwatches, type GradientSwatch } from "@/features/templates/email-templates/gradientSwatches";
import { TemplateBrandingSection } from "@/features/templates/email-templates/TemplateBrandingSection";
import { VariablesPanel } from "@/features/templates/email-templates/VariablesPanel";
import type { BoundActionVariables } from "@/features/templates/email-templates/variablesPanelModel";
import { useEmailActions } from "@/features/templates/hooks/useEmailActions";
import { type EmailBranding, useEmailBranding } from "@/features/templates/hooks/useEmailBranding";
import {
  type EmailTemplateInput,
  useCreateEmailTemplate,
  useEmailTemplate,
  useEmailTemplates,
  useSendTestEmail,
  useUpdateEmailTemplate,
} from "@/features/templates/hooks/useEmailTemplates";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import type { EmailTemplateBranding } from "@/shared/contracts/admin-email-templates";

const EmailTestFeedbackType = {
  Ok: "ok",
  Error: "err",
} as const;

const HttpStatus = {
  Conflict: 409,
} as const;

type EmailTestFeedbackType = (typeof EmailTestFeedbackType)[keyof typeof EmailTestFeedbackType];

interface TemplateFormFields {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  branding: EmailTemplateBranding;
}

/** A fresh template's branding: every override null (inherits the global default). */
const EMPTY_TEMPLATE_BRANDING: EmailTemplateBranding = {
  headerAssetId: null,
  footerAssetId: null,
  footerText: null,
  lightBackgroundAssetId: null,
  darkBackgroundAssetId: null,
  lightGradientTop: null,
  lightGradientBottom: null,
  darkGradientTop: null,
  darkGradientBottom: null,
};

/**
 * Create/edit page for a single email template.
 * Route: `/email-templates/new` or `/email-templates/:id`
 */
export function EmailTemplateEditPage() {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id?: string }>();
  const isNew = !idParam || idParam === "new";
  const numId = isNew ? 0 : Number(idParam);

  const { data: existing, isLoading } = useEmailTemplate(numId);
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate(numId);
  const sendTestMutation = useSendTestEmail();
  const [testFeedback, setTestFeedback] = useState<{ type: EmailTestFeedbackType; text: string } | null>(null);

  const [form, setForm] = useState<TemplateFormFields>({
    name: "",
    subject: "",
    blocks: [],
    branding: EMPTY_TEMPLATE_BRANDING,
  });
  const { name, subject, blocks, branding } = form;

  // Global branding default + all templates, for the branding-override editor:
  // the global seeds a gradient when an override is switched on, and the
  // template list feeds the gradient preset swatches.
  const { data: globalBranding } = useEmailBranding();
  const { data: allTemplates } = useEmailTemplates();
  const swatches = collectGradientSwatches(globalBranding, allTemplates);

  // Actions this template is bound to drive the variables panel: their
  // recipient kind decides which recipient-scope variables resolve, their
  // context variables form the "action" group. Unbound/new templates get the
  // panel's admin-user default.
  const { data: emailActions } = useEmailActions();
  const boundActions: BoundActionVariables[] = [];
  for (const action of emailActions ?? []) {
    if (action.bindings.some((binding) => binding.templateId === numId)) {
      boundActions.push({ recipientKind: action.recipientKind, contextVariables: action.contextVariables });
    }
  }

  // Variables-panel insertion routing: the most recently focused text target
  // (subject input or a text block's Markdown editor) registers an
  // insert-at-cursor function here; chip clicks go to that target. Before any
  // focus happened, insertions append to the subject.
  const activeInsertRef = useRef<((text: string) => void) | null>(null);
  const registerInsertTarget = useCallback((insert: (text: string) => void) => {
    activeInsertRef.current = insert;
  }, []);

  function handleInsertVariable(variableName: string) {
    const text = `{{${variableName}}}`;
    const insert = activeInsertRef.current;
    if (insert) {
      insert(text);
    } else {
      updateField("subject", `${subject}${text}`);
    }
  }

  const updateField = <K extends keyof TemplateFormFields>(key: K, value: TemplateFormFields[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const [savedIndicator, setSavedIndicator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when existing template data arrives (adjust-state-during-render pattern)
  const syncedExistingIdRef = useRef<number | undefined>(undefined);
  if (existing && existing.id !== syncedExistingIdRef.current) {
    syncedExistingIdRef.current = existing.id;
    setForm({
      name: existing.name,
      subject: existing.subject,
      blocks: existing.blocks,
      branding: existing.branding,
    });
  }

  function buildPayload(): EmailTemplateInput {
    return {
      name: name.trim(),
      subject: subject.trim(),
      blocks,
      branding,
    };
  }

  function handleSave() {
    setError(null);
    const payload = buildPayload();

    if (isNew) {
      createMutation.mutate(payload, {
        onSuccess: (created) => {
          void navigate(`/email-templates/${created.id}`, { replace: true });
        },
        onError: (err: unknown) => {
          const status = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
          setError(status === HttpStatus.Conflict ? m.nameConflict : m.saveError);
        },
      });
    } else {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          setSavedIndicator(true);
          setTimeout(() => setSavedIndicator(false), 2000);
        },
        onError: () => {
          setError(m.saveError);
        },
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSendTest = !isNew && !isPending && !sendTestMutation.isPending;

  function handleSendTest() {
    if (!canSendTest) return;
    setTestFeedback(null);
    sendTestMutation.mutate(numId, {
      onSuccess: (result) => {
        setTestFeedback({ type: EmailTestFeedbackType.Ok, text: m.testSent.replace("{email}", result.to) });
        setTimeout(() => setTestFeedback(null), 3000);
      },
      onError: () => {
        setTestFeedback({ type: EmailTestFeedbackType.Error, text: m.testFailed });
        setTimeout(() => setTestFeedback(null), 3000);
      },
    });
  }

  useKeyboardSave(handleSave, !isPending);

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--ds-text-muted)] text-sm">
        {messages.common.loading}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={name || m.newTemplate}
        renderLeading={() => (
          <HeaderBackButton label={messages.emailTemplates.listTitle} onClick={() => navigate("/email-templates")} />
        )}
      >
        <EmailTemplateHeaderActions
          savedIndicator={savedIndicator}
          testFeedback={testFeedback}
          error={error}
          status={{
            isPending,
            showSendTest: !isNew,
            canSendTest,
            isSendingTest: sendTestMutation.isPending,
          }}
          savedLabel={m.saved}
          sendingTestLabel={m.sendingTest}
          sendTestLabel={m.sendTest}
          savingLabel={messages.common.saving}
          saveLabel={m.save}
          onSendTest={handleSendTest}
          onSave={handleSave}
        />
      </PageHeader>

      <EmailTemplateMetaBar
        name={name}
        isSystemTemplate={Boolean(existing?.isSystemTemplate)}
        labels={{
          newTemplate: m.newTemplate,
          templateName: m.templateName,
          systemBadge: m.systemBadge,
        }}
        onNameChange={(value) => updateField("name", value)}
      />

      {/* Keyed by numId so switching templates in place (route param change, no page unmount)
          resets TemplateBrandingSection's local override state instead of carrying over stale
          modes from the previous template. */}
      <EmailTemplateEditorGrid
        key={numId}
        form={form}
        labels={m}
        onFieldChange={updateField}
        global={globalBranding}
        swatches={swatches}
        boundActions={boundActions}
        onInsertVariable={handleInsertVariable}
        registerInsertTarget={registerInsertTarget}
      />
    </div>
  );
}

interface EmailTemplateHeaderActionsProps {
  savedIndicator: boolean;
  testFeedback: { type: EmailTestFeedbackType; text: string } | null;
  error: string | null;
  status: {
    isPending: boolean;
    showSendTest: boolean;
    canSendTest: boolean;
    isSendingTest: boolean;
  };
  savedLabel: string;
  sendingTestLabel: string;
  sendTestLabel: string;
  savingLabel: string;
  saveLabel: string;
  onSendTest: () => void;
  onSave: () => void;
}

function EmailTemplateHeaderActions({
  savedIndicator,
  testFeedback,
  error,
  status,
  savedLabel,
  sendingTestLabel,
  sendTestLabel,
  savingLabel,
  saveLabel,
  onSendTest,
  onSave,
}: EmailTemplateHeaderActionsProps) {
  return (
    <div className="flex items-center gap-3">
      {savedIndicator && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircleIcon weight="duotone" className="size-3.5" />
          {savedLabel}
        </span>
      )}
      {testFeedback && (
        <span
          className={`text-xs ${testFeedback.type === EmailTestFeedbackType.Ok ? "text-green-400" : "text-red-500"}`}
        >
          {testFeedback.text}
        </span>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {status.showSendTest && (
        <DashboardButton
          disabled={!status.canSendTest}
          leadingIcon={<PaperPlaneTiltIcon weight="duotone" className="size-3.5" />}
          onClick={onSendTest}
          size="action"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        >
          {status.isSendingTest ? sendingTestLabel : sendTestLabel}
        </DashboardButton>
      )}
      <SaveActionButton
        type="button"
        onClick={onSave}
        disabled={status.isPending}
        busyLabel={savingLabel}
        label={saveLabel}
        status={status.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
      />
    </div>
  );
}

interface EmailTemplateMetaBarProps {
  name: string;
  isSystemTemplate: boolean;
  labels: {
    newTemplate: string;
    templateName: string;
    systemBadge: string;
  };
  onNameChange: (value: string) => void;
}

function EmailTemplateMetaBar({ name, isSystemTemplate, labels, onNameChange }: EmailTemplateMetaBarProps) {
  return (
    <div className="flex shrink-0 items-end gap-3 px-3 py-2">
      <DashboardInput
        fieldClassName="w-64"
        id="email-template-name"
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder={labels.newTemplate}
        className="font-mono"
        label={labels.templateName}
      />
      <div className="ml-auto flex items-center">
        {isSystemTemplate && (
          <span className="px-2 py-0.5 rounded text-xs bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)]">
            {labels.systemBadge}
          </span>
        )}
      </div>
    </div>
  );
}

interface EmailTemplateEditorGridProps {
  form: TemplateFormFields;
  labels: ReturnType<typeof useI18n>["messages"]["emailTemplates"];
  onFieldChange: <K extends keyof TemplateFormFields>(key: K, value: TemplateFormFields[K]) => void;
  global: EmailBranding | undefined;
  swatches: GradientSwatch[];
  /** Actions the template is bound to (drives the variables panel's groups). */
  boundActions: BoundActionVariables[];
  /** Inserts `{{name}}` into the most recently focused text target. */
  onInsertVariable: (name: string) => void;
  /** Registers a text target's insert-at-cursor function (subject input, Markdown editors). */
  registerInsertTarget: (insert: (text: string) => void) => void;
}

function EmailTemplateEditorGrid({
  form,
  labels,
  onFieldChange,
  global,
  swatches,
  boundActions,
  onInsertVariable,
  registerInsertTarget,
}: EmailTemplateEditorGridProps) {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="grid h-full grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
        <div className="min-w-0 overflow-y-auto">
          <div className="space-y-4">
            <DashboardSection className="overflow-hidden">
              <DashboardSection.Header
                icon={<EnvelopeSimpleIcon weight="duotone" className="size-4" />}
                title={labels.templateSubject}
              />
              <DashboardSection.Body>
                <DashboardInput
                  aria-label={labels.templateSubject}
                  id="tpl-subject"
                  required
                  type="text"
                  value={form.subject}
                  onChange={(event) => onFieldChange("subject", event.target.value)}
                  onFocus={(event) => {
                    // Register this input as the active variables-insert
                    // target. The inserter reads value + caret from the DOM at
                    // insert time (the input is controlled, so `el.value` is
                    // always current) and restores focus + caret afterwards.
                    const el = event.currentTarget;
                    registerInsertTarget((text) => {
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? start;
                      onFieldChange("subject", `${el.value.slice(0, start)}${text}${el.value.slice(end)}`);
                      requestAnimationFrame(() => {
                        el.focus();
                        const caret = start + text.length;
                        el.setSelectionRange(caret, caret);
                      });
                    });
                  }}
                  placeholder={labels.subjectPlaceholder}
                />
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection className="overflow-hidden">
              <DashboardSection.Header
                icon={<ArticleIcon weight="duotone" className="size-4" />}
                title={labels.blocksTitle}
              />
              <DashboardSection.Body>
                <BlockEditor
                  blocks={form.blocks}
                  onChange={(blocks) => onFieldChange("blocks", blocks)}
                  registerMarkdownInsert={registerInsertTarget}
                />
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection className="overflow-hidden">
              <DashboardSection.Header
                icon={<TagIcon weight="duotone" className="size-4" />}
                title={labels.variablesTitle}
              />
              <DashboardSection.Body>
                <VariablesPanel
                  subject={form.subject}
                  blocks={form.blocks}
                  boundActions={boundActions}
                  onInsert={onInsertVariable}
                  labels={labels}
                />
              </DashboardSection.Body>
            </DashboardSection>

            <TemplateBrandingSection
              branding={form.branding}
              onChange={(next) => onFieldChange("branding", next)}
              global={global}
              swatches={swatches}
            />
          </div>
        </div>

        <div className="min-h-[32rem] overflow-hidden xl:min-h-0">
          <EmailPreview blocks={form.blocks} branding={form.branding} />
        </div>
      </div>
    </div>
  );
}

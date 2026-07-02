import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
  DashboardInput,
  SaveActionButton,
} from "@musiccloud/dashboard-ui";
import type { EmailBlock } from "@musiccloud/shared";
import { ArticleIcon, CheckCircleIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, TagIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import { BlockEditor } from "@/features/templates/email-templates/BlockEditor";
import { EmailPreview } from "@/features/templates/email-templates/EmailPreview";
import {
  type EmailTemplateInput,
  useCreateEmailTemplate,
  useEmailTemplate,
  useSendTestEmail,
  useUpdateEmailTemplate,
} from "@/features/templates/hooks/useEmailTemplates";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import type { EmailTemplateVariable } from "@/shared/contracts/admin-email-templates";

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
  requiredVariables: EmailTemplateVariable[];
}

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
    requiredVariables: [],
  });
  const { name, subject, blocks, requiredVariables } = form;

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
      requiredVariables: existing.requiredVariables,
    });
  }

  function buildPayload(): EmailTemplateInput {
    return {
      name: name.trim(),
      subject: subject.trim(),
      blocks,
      requiredVariables,
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
          resets RequiredVariablesEditor's local row-identity state instead of carrying over
          stale keys from the previous template's requiredVariables array. */}
      <EmailTemplateEditorGrid key={numId} form={form} labels={m} onFieldChange={updateField} />
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
}

function EmailTemplateEditorGrid({ form, labels, onFieldChange }: EmailTemplateEditorGridProps) {
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
                <BlockEditor blocks={form.blocks} onChange={(blocks) => onFieldChange("blocks", blocks)} />
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection className="overflow-hidden">
              <DashboardSection.Header
                icon={<TagIcon weight="duotone" className="size-4" />}
                title={labels.requiredVariablesTitle}
              />
              <DashboardSection.Body>
                <RequiredVariablesEditor
                  variables={form.requiredVariables}
                  labels={labels}
                  onChange={(requiredVariables) => onFieldChange("requiredVariables", requiredVariables)}
                />
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        </div>

        <div className="min-h-[32rem] overflow-hidden xl:min-h-0">
          <EmailPreview blocks={form.blocks} />
        </div>
      </div>
    </div>
  );
}

interface RequiredVariablesEditorProps {
  variables: EmailTemplateVariable[];
  labels: ReturnType<typeof useI18n>["messages"]["emailTemplates"];
  onChange: (variables: EmailTemplateVariable[]) => void;
}

/**
 * Small inline editor for a template's `requiredVariables`: a hand-declared
 * list of `{name, description}` rows (e.g. `inviteUrl` — "the invite
 * acceptance link"), with add/remove per row. Declaring a variable here is
 * what the backend's action-binding compatibility check validates against
 * (`POST .../bindings` rejects a binding whose action doesn't supply every
 * name declared here) and what the test-send flow prompts for — an empty
 * list is the permissive default (no variables enforced).
 *
 * Rows carry no id of their own (`EmailTemplateVariable` is just
 * `{name, description}`), so a parallel array of locally-generated, stable
 * row keys is kept alongside `variables` — recomputed only on add/remove, via
 * a monotonic counter rather than the array index, so React never
 * misattributes an input's DOM state to the wrong row after a mid-list
 * removal.
 */
function RequiredVariablesEditor({ variables, labels, onChange }: RequiredVariablesEditorProps) {
  const nextRowKeyRef = useRef(0);
  const [rowKeys, setRowKeys] = useState<number[]>(() => variables.map(() => nextRowKeyRef.current++));

  function updateAt(index: number, next: EmailTemplateVariable) {
    onChange(variables.map((v, i) => (i === index ? next : v)));
  }

  function removeAt(index: number) {
    onChange(variables.filter((_, i) => i !== index));
    setRowKeys((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...variables, { name: "", description: "" }]);
    setRowKeys((prev) => [...prev, nextRowKeyRef.current++]);
  }

  return (
    <div className="space-y-2">
      {variables.map((variable, index) => (
        <div key={rowKeys[index] ?? index} className="flex items-start gap-2">
          <DashboardInput
            type="text"
            value={variable.name}
            onChange={(e) => updateAt(index, { ...variable, name: e.target.value })}
            placeholder={labels.requiredVariableName}
            className="w-40 font-mono"
          />
          <DashboardInput
            type="text"
            value={variable.description}
            onChange={(e) => updateAt(index, { ...variable, description: e.target.value })}
            placeholder={labels.requiredVariableDescription}
            className="flex-1"
          />
          <DashboardActionButton
            action={DashboardActionId.Remove}
            iconOnly
            label={labels.addRequiredVariable}
            onClick={() => removeAt(index)}
            size="action"
            type="button"
          />
        </div>
      ))}
      <DashboardActionButton
        action={DashboardActionId.Create}
        label={labels.addRequiredVariable}
        onClick={add}
        size="action"
        type="button"
        variant={DashboardButtonVariant.Neutral}
      />
    </div>
  );
}

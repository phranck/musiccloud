import { DashboardButton, DashboardInput, SaveActionButton } from "@musiccloud/dashboard-ui";
import {
  ArticleIcon,
  CheckCircleIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  PaperPlaneTiltIcon,
  SealWarningIcon,
  SquareHalfBottomIcon,
} from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import { EmailPreview } from "@/features/templates/email-templates/EmailPreview";
import {
  type EmailTemplateInput,
  useCreateEmailTemplate,
  useEmailTemplate,
  useSendTestEmail,
  useUpdateEmailTemplate,
} from "@/features/templates/hooks/useEmailTemplates";
import { useKeyboardSave } from "@/lib/useKeyboardSave";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

const FLUSH_MARKDOWN_EDITOR_CLASS = "rounded-none border-x-0 border-b-0";

interface TemplateFormFields {
  name: string;
  subject: string;
  headerBannerUrl: string;
  headerText: string;
  bodyText: string;
  footerBannerUrl: string;
  footerText: string;
}

function MarkdownEditorField({
  id,
  label,
  required,
  showLabel = true,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  showLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={showLabel ? "block px-3 pb-1 text-xs font-medium text-[var(--ds-text-subtle)]" : "sr-only"}
      >
        {label}
        {required && (
          <SealWarningIcon weight="duotone" className="inline-block ml-1 size-3 text-red-500 align-middle" />
        )}
      </label>
      {children}
    </div>
  );
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
  const [testFeedback, setTestFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [form, setForm] = useState<TemplateFormFields>({
    name: "",
    subject: "",
    headerBannerUrl: "",
    headerText: "",
    bodyText: "",
    footerBannerUrl: "",
    footerText: "",
  });
  const { name, subject, headerBannerUrl, headerText, bodyText, footerBannerUrl, footerText } = form;

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
      headerBannerUrl: existing.headerBannerUrl ?? "",
      headerText: existing.headerText ?? "",
      bodyText: existing.bodyText,
      footerBannerUrl: existing.footerBannerUrl ?? "",
      footerText: existing.footerText ?? "",
    });
  }

  function buildPayload(): EmailTemplateInput {
    return {
      name: name.trim(),
      subject: subject.trim(),
      headerBannerUrl: headerBannerUrl.trim() || undefined,
      headerText: headerText || undefined,
      bodyText,
      footerBannerUrl: footerBannerUrl.trim() || undefined,
      footerText: footerText || undefined,
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
          setError(status === 409 ? m.nameConflict : m.saveError);
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
        setTestFeedback({ type: "ok", text: m.testSent.replace("{email}", result.to) });
        setTimeout(() => setTestFeedback(null), 3000);
      },
      onError: () => {
        setTestFeedback({ type: "err", text: m.testFailed });
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
        leading={
          <HeaderBackButton label={messages.emailTemplates.listTitle} onClick={() => navigate("/email-templates")} />
        }
      >
        <EmailTemplateHeaderActions
          savedIndicator={savedIndicator}
          testFeedback={testFeedback}
          error={error}
          isPending={isPending}
          showSendTest={!isNew}
          canSendTest={canSendTest}
          isSendingTest={sendTestMutation.isPending}
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

      <EmailTemplateEditorGrid form={form} labels={m} onFieldChange={updateField} />
    </div>
  );
}

interface EmailTemplateHeaderActionsProps {
  savedIndicator: boolean;
  testFeedback: { type: "ok" | "err"; text: string } | null;
  error: string | null;
  isPending: boolean;
  showSendTest: boolean;
  canSendTest: boolean;
  isSendingTest: boolean;
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
  isPending,
  showSendTest,
  canSendTest,
  isSendingTest,
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
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircleIcon weight="duotone" className="size-3.5" />
          {savedLabel}
        </span>
      )}
      {testFeedback && (
        <span
          className={`text-xs ${testFeedback.type === "ok" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
        >
          {testFeedback.text}
        </span>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {showSendTest && (
        <DashboardButton
          disabled={!canSendTest}
          leadingIcon={<PaperPlaneTiltIcon weight="duotone" className="size-3.5" />}
          onClick={onSendTest}
          size="action"
          type="button"
          variant="neutral"
        >
          {isSendingTest ? sendingTestLabel : sendTestLabel}
        </DashboardButton>
      )}
      <SaveActionButton
        type="button"
        onClick={onSave}
        disabled={isPending}
        busyLabel={savingLabel}
        label={saveLabel}
        status={isPending ? "busy" : "idle"}
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

            <EmailTemplateMarkdownSection
              icon={<EnvelopeOpenIcon weight="duotone" className="size-4" />}
              title={labels.sectionHeader}
              banner={{
                id: "tpl-header-banner",
                value: form.headerBannerUrl,
                label: labels.headerBanner,
                placeholder: "https://example.com/header.png",
                onChange: (value) => onFieldChange("headerBannerUrl", value),
              }}
              editor={{
                id: "tpl-header-text",
                value: form.headerText,
                label: labels.headerText,
                rows: 4,
                fallbackHeight: "h-[6rem]",
                onChange: (value) => onFieldChange("headerText", value),
              }}
            />

            <EmailTemplateMarkdownSection
              icon={<ArticleIcon weight="duotone" className="size-4" />}
              title={
                <>
                  {labels.sectionBody}
                  <SealWarningIcon weight="duotone" className="inline-block ml-1 size-3.5 text-red-500 align-middle" />
                </>
              }
              editor={{
                id: "tpl-body-text",
                value: form.bodyText,
                label: labels.bodyText,
                rows: 12,
                fallbackHeight: "h-[18rem]",
                required: true,
                showLabel: false,
                onChange: (value) => onFieldChange("bodyText", value),
              }}
            />

            <EmailTemplateMarkdownSection
              icon={<SquareHalfBottomIcon weight="duotone" className="size-4" />}
              title={labels.sectionFooter}
              banner={{
                id: "tpl-footer-banner",
                value: form.footerBannerUrl,
                label: labels.footerBanner,
                placeholder: "https://example.com/footer.png",
                onChange: (value) => onFieldChange("footerBannerUrl", value),
              }}
              editor={{
                id: "tpl-footer-text",
                value: form.footerText,
                label: labels.footerText,
                rows: 4,
                fallbackHeight: "h-[6rem]",
                onChange: (value) => onFieldChange("footerText", value),
              }}
            />
          </div>
        </div>

        <div className="min-h-[32rem] overflow-hidden xl:min-h-0">
          <EmailPreview
            headerBannerUrl={form.headerBannerUrl}
            headerText={form.headerText}
            bodyText={form.bodyText}
            footerBannerUrl={form.footerBannerUrl}
            footerText={form.footerText}
          />
        </div>
      </div>
    </div>
  );
}

interface EmailTemplateMarkdownSectionProps {
  icon: ReactNode;
  title: ReactNode;
  banner?: {
    id: string;
    value: string;
    label: string;
    placeholder: string;
    onChange: (value: string) => void;
  };
  editor: {
    id: string;
    value: string;
    label: string;
    rows: number;
    fallbackHeight: string;
    required?: boolean;
    showLabel?: boolean;
    onChange: (value: string) => void;
  };
}

function EmailTemplateMarkdownSection({ icon, title, banner, editor }: EmailTemplateMarkdownSectionProps) {
  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header icon={icon} title={title} />
      <DashboardSection.Body className="!gap-0 !p-0">
        {banner && (
          <div className="p-3">
            <DashboardInput
              id={banner.id}
              type="text"
              value={banner.value}
              onChange={(event) => banner.onChange(event.target.value)}
              placeholder={banner.placeholder}
              label={banner.label}
            />
          </div>
        )}
        <MarkdownEditorField
          id={editor.id}
          label={editor.label}
          required={editor.required}
          showLabel={editor.showLabel}
        >
          <Suspense
            fallback={
              <div
                className={`${editor.fallbackHeight} animate-pulse rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]`}
              />
            }
          >
            <MarkdownEditor
              id={editor.id}
              value={editor.value}
              onChange={editor.onChange}
              rows={editor.rows}
              resizable
              className={FLUSH_MARKDOWN_EDITOR_CLASS}
            />
          </Suspense>
        </MarkdownEditorField>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

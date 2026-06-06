import { DashboardActionButton, DashboardActionId, DashboardInput, TextareaPrimitive } from "@musiccloud/dashboard-ui";
import { TrashIcon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { type MarkdownWidget, MarkdownWidgetType } from "@/features/system/hooks/useMarkdownWidgets";

const fieldLabelClass = "px-1 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]";
const fieldHintClass = "px-1 text-xs leading-5 text-[var(--ds-text-subtle)]";
const selectClass =
  "h-[var(--ds-control-h-field)] w-full rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)]";
const checkboxRowClass =
  "flex h-[var(--ds-control-h-field)] items-center gap-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3";
const insetCardClass =
  "space-y-3 rounded-[calc(var(--radius-card)-12px)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-3";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: The children prop always contains an input/select/textarea element, but Biome cannot statically verify this.
    <label className="flex flex-col gap-1">
      <span className={fieldLabelClass}>{label}</span>
      {children}
      {hint ? <p className={fieldHintClass}>{hint}</p> : null}
    </label>
  );
}

type DraftPatch = Partial<MarkdownWidget>;

interface WidgetTypeOption {
  value: MarkdownWidget["type"];
  label: string;
  description: string;
}

interface WidgetMessages {
  markdownLabel: string;
  deleteWidget: string;
  keyLabel: string;
  keyHint: string;
  nameLabel: string;
  typeLabel: string;
  typeHint: string;
  defaultHeightLabel: string;
  defaultHeightHint: string;
  enabledLabel: string;
  descriptionLabel: string;
  descriptionHint: string;
  configurationTitle: string;
  usageTitle: string;
  widgetUsage: string;
  imageUsage: string;
  pdfUsage: string;
  pdfExampleLabel: string;
  types: {
    html: { snippetLabel: string; snippetHint: string };
    iframe: { urlLabel: string; urlHint: string };
  };
}

interface WidgetEditorPanelProps {
  draft: DraftPatch;
  selectedWidgetId: number;
  widgetTypeOptions: WidgetTypeOption[];
  messages: WidgetMessages;
  onUpdateDraft: (updater: (d: DraftPatch) => DraftPatch) => void;
  onDelete: (id: number) => void;
}

export function WidgetEditorPanel({
  draft,
  selectedWidgetId,
  widgetTypeOptions,
  messages,
  onUpdateDraft,
  onDelete,
}: WidgetEditorPanelProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ds-text)]">{draft.name}</h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              {messages.markdownLabel}:
              <span className="ml-2 rounded bg-[var(--ds-bg-elevated)] px-2 py-1 font-mono text-xs">
                [[widget:{draft.key}]]
              </span>
            </p>
          </div>
          <DashboardActionButton
            action={DashboardActionId.Delete}
            icon={<TrashIcon weight="duotone" className="size-3.5" />}
            label={messages.deleteWidget}
            onClick={() => onDelete(selectedWidgetId)}
            size="control"
            type="button"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={messages.keyLabel} hint={messages.keyHint}>
            <DashboardInput
              value={draft.key ?? ""}
              onChange={(event) => onUpdateDraft((d) => ({ ...d, key: event.target.value.toLowerCase() }))}
            />
          </Field>

          <Field label={messages.nameLabel}>
            <DashboardInput
              value={draft.name ?? ""}
              onChange={(event) => onUpdateDraft((d) => ({ ...d, name: event.target.value }))}
            />
          </Field>

          <Field label={messages.typeLabel} hint={messages.typeHint}>
            <select
              value={draft.type ?? MarkdownWidgetType.Html}
              onChange={(event) =>
                onUpdateDraft((d) => ({
                  ...d,
                  type: event.target.value as MarkdownWidget["type"],
                }))
              }
              className={selectClass}
            >
              {widgetTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={messages.defaultHeightLabel} hint={messages.defaultHeightHint}>
            <DashboardInput
              type="number"
              min={80}
              max={2400}
              value={draft.defaultHeight ?? 320}
              onChange={(event) =>
                onUpdateDraft((d) => ({
                  ...d,
                  defaultHeight: Number(event.target.value) || 320,
                }))
              }
            />
          </Field>
        </div>

        <label className={checkboxRowClass}>
          <input
            type="checkbox"
            checked={draft.enabled ?? false}
            onChange={(event) => onUpdateDraft((d) => ({ ...d, enabled: event.target.checked }))}
          />
          <span className="text-sm text-[var(--ds-text)]">{messages.enabledLabel}</span>
        </label>

        <Field label={messages.descriptionLabel} hint={messages.descriptionHint}>
          <TextareaPrimitive
            rows={3}
            value={draft.description ?? ""}
            onChange={(event) => onUpdateDraft((d) => ({ ...d, description: event.target.value }))}
          />
        </Field>

        <div className={insetCardClass}>
          <h3 className="text-sm font-semibold text-[var(--ds-text)]">{messages.configurationTitle}</h3>
          <p className={fieldHintClass}>
            {widgetTypeOptions.find((option) => option.value === draft.type)?.description}
          </p>

          {draft.type === MarkdownWidgetType.Html ? (
            <Field label={messages.types.html.snippetLabel} hint={messages.types.html.snippetHint}>
              <TextareaPrimitive
                rows={14}
                value={draft.snippet ?? ""}
                onChange={(event) => onUpdateDraft((d) => ({ ...d, snippet: event.target.value }))}
                className="font-mono text-xs"
              />
            </Field>
          ) : (
            <Field label={messages.types.iframe.urlLabel} hint={messages.types.iframe.urlHint}>
              <DashboardInput
                type="url"
                value={draft.url ?? ""}
                onChange={(event) => onUpdateDraft((d) => ({ ...d, url: event.target.value }))}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold text-[var(--ds-text)]">{messages.usageTitle}</h3>
        <p className={`${fieldHintClass} leading-5`}>
          {messages.widgetUsage}:<span className="ml-2 font-mono">[[widget:{draft.key}]]</span>
        </p>
        <p className={`${fieldHintClass} leading-5`}>
          {messages.imageUsage}:<span className="ml-2 font-mono">[[image:/uploads/datei.jpg alt="Alt" width=320]]</span>
        </p>
        <p className={`${fieldHintClass} leading-5`}>
          {messages.pdfUsage}:
          <span className="ml-2 font-mono">{`[[pdf:/uploads/datei.pdf label="${messages.pdfExampleLabel}"]]`}</span>
        </p>
      </Card>
    </div>
  );
}

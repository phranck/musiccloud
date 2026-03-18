import { DownloadIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import type { MarkdownWidget } from "@/features/system/hooks/useMarkdownWidgets";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  PageBody,
  PageLayout,
  PageSplitAside,
  PageSplitLayout,
  PageSplitMain,
} from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import {
  useCreateMarkdownWidget,
  useDeleteMarkdownWidget,
  useMarkdownWidgets,
  useSaveMarkdownWidget,
} from "@/features/system/hooks/useMarkdownWidgets";

const fieldLabelClass =
  "px-1 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]";
const fieldHintClass = "px-1 text-xs leading-5 text-[var(--ds-text-subtle)]";
const textInputClass =
  "h-9 w-full rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-[var(--color-primary)]";
const textAreaClass =
  "w-full rounded-[calc(var(--radius-control)-2px)] border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3 py-1.5 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-[var(--color-primary)]";
const checkboxRowClass =
  "flex h-9 items-center gap-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3";
const insetCardClass =
  "space-y-3 rounded-[calc(var(--radius-card)-12px)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-3";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelClass}>{label}</span>
      {children}
      {hint ? <p className={fieldHintClass}>{hint}</p> : null}
    </label>
  );
}

export function MarkdownWidgetsPage() {
  const { messages } = useI18n();
  const common = messages.common;
  const widgetMessages = messages.content.markdownWidgets;
  const { data: widgets = [], isLoading } = useMarkdownWidgets();
  const saveWidget = useSaveMarkdownWidget();
  const createWidget = useCreateMarkdownWidget();
  const deleteWidget = useDeleteMarkdownWidget();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<MarkdownWidget> | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (widgets.length > 0 && selectedId === null) {
      setSelectedId(widgets[0].id);
    }
  }, [widgets, selectedId]);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedId) ?? null,
    [widgets, selectedId],
  );

  useEffect(() => {
    if (selectedWidget) {
      setDraft({
        key: selectedWidget.key,
        name: selectedWidget.name,
        type: selectedWidget.type,
        enabled: selectedWidget.enabled,
        description: selectedWidget.description,
        defaultHeight: selectedWidget.defaultHeight,
        snippet: selectedWidget.snippet,
        url: selectedWidget.url,
      });
      setSavedOk(false);
    } else {
      setDraft(null);
    }
  }, [selectedWidget]);

  const widgetTypeOptions = useMemo(
    () =>
      [
        {
          value: "html" as const,
          label: widgetMessages.types.html.label,
          description: widgetMessages.types.html.description,
        },
        {
          value: "iframe" as const,
          label: widgetMessages.types.iframe.label,
          description: widgetMessages.types.iframe.description,
        },
      ],
    [widgetMessages],
  );

  function updateDraft(updater: (d: Partial<MarkdownWidget>) => Partial<MarkdownWidget>) {
    setDraft((current) => (current ? updater(current) : current));
    setSavedOk(false);
  }

  function handleAddWidget() {
    createWidget.mutate(
      { key: `widget-${widgets.length + 1}`, name: `Widget ${widgets.length + 1}`, type: "html", enabled: true, defaultHeight: 320 },
      {
        onSuccess: (created) => {
          setSelectedId(created.id);
        },
      },
    );
  }

  function handleDeleteWidget(id: number) {
    deleteWidget.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) {
          setSelectedId(widgets.find((w) => w.id !== id)?.id ?? null);
        }
      },
    });
  }

  function handleSave() {
    if (!selectedId || !draft) return;
    saveWidget.mutate(
      { id: selectedId, data: draft },
      {
        onSuccess: () => {
          setSavedOk(true);
        },
      },
    );
  }

  useKeyboardSave(handleSave, Boolean(draft) && !saveWidget.isPending);

  return (
    <PageLayout>
      <PageHeader title={widgetMessages.title}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!draft || saveWidget.isPending}
          className="flex items-center gap-2 h-8 min-w-8 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-60 transition-colors"
        >
          <DownloadIcon weight="duotone" className="w-3.5 h-3.5" />
          {savedOk ? common.saved : saveWidget.isPending ? common.saving : common.save}
        </button>
      </PageHeader>

      <PageBody>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
          </div>
        ) : (
          <PageSplitLayout columnsClassName="xl:grid-cols-[30rem_minmax(0,1fr)]">
            <PageSplitAside>
              <Card className="h-full p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--ds-text)]">
                      {widgetMessages.widgetsTitle}
                    </h2>
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      {widgetMessages.widgetsHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddWidget}
                    className="inline-flex h-8 items-center gap-1.5 rounded-control border border-[var(--ds-border)] px-3 text-xs font-medium text-[var(--ds-text)] hover:border-[var(--ds-border-strong)]"
                  >
                    <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
                    {widgetMessages.newWidget}
                  </button>
                </div>

                <div className="space-y-2">
                  {widgets.length === 0 ? (
                    <div className="rounded-card border border-dashed border-[var(--ds-border)] px-3 py-4 text-xs leading-5 text-[var(--ds-text-muted)]">
                      {widgetMessages.emptyTitle} {widgetMessages.emptyHint}
                    </div>
                  ) : (
                    widgets.map((widget) => {
                      const isSelected = widget.id === selectedId;
                      const typeLabel = widgetTypeOptions.find(
                        (option) => option.value === widget.type,
                      )?.label;
                      return (
                        <button
                          key={widget.id}
                          type="button"
                          onClick={() => setSelectedId(widget.id)}
                          className={`w-full rounded-card border px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-[var(--color-primary)] bg-[var(--ds-bg-elevated)]"
                              : "border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-[var(--ds-text)]">
                              {widget.name}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${
                                widget.enabled
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-stone-500/10 text-stone-400"
                              }`}
                            >
                              {widget.enabled ? widgetMessages.active : widgetMessages.inactive}
                            </span>
                          </div>
                          <div className="mt-1 truncate font-mono text-[0.6875rem] text-[var(--ds-text-muted)]">
                            [[widget:{widget.key}]]
                          </div>
                          <div className="mt-1 text-[0.6875rem] text-[var(--ds-text-muted)]">
                            {typeLabel}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </Card>
            </PageSplitAside>

            <PageSplitMain>
              {draft && selectedWidget ? (
                <div className="space-y-4">
                  <Card className="p-4 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--ds-text)]">
                          {draft.name}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
                          {widgetMessages.markdownLabel}:
                          <span className="ml-2 rounded bg-[var(--ds-bg-elevated)] px-2 py-1 font-mono text-xs">
                            [[widget:{draft.key}]]
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteWidget(selectedWidget.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-control border border-[var(--ds-btn-danger-border)] px-3 text-sm font-medium text-[var(--ds-btn-danger-text)] hover:bg-[var(--ds-btn-danger-hover-bg)]"
                      >
                        <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
                        {widgetMessages.deleteWidget}
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={widgetMessages.keyLabel} hint={widgetMessages.keyHint}>
                        <input
                          value={draft.key ?? ""}
                          onChange={(event) =>
                            updateDraft((d) => ({ ...d, key: event.target.value.toLowerCase() }))
                          }
                          className={textInputClass}
                        />
                      </Field>

                      <Field label={widgetMessages.nameLabel}>
                        <input
                          value={draft.name ?? ""}
                          onChange={(event) =>
                            updateDraft((d) => ({ ...d, name: event.target.value }))
                          }
                          className={textInputClass}
                        />
                      </Field>

                      <Field label={widgetMessages.typeLabel} hint={widgetMessages.typeHint}>
                        <select
                          value={draft.type ?? "html"}
                          onChange={(event) =>
                            updateDraft((d) => ({
                              ...d,
                              type: event.target.value as MarkdownWidget["type"],
                            }))
                          }
                          className={textInputClass}
                        >
                          {widgetTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        label={widgetMessages.defaultHeightLabel}
                        hint={widgetMessages.defaultHeightHint}
                      >
                        <input
                          type="number"
                          min={80}
                          max={2400}
                          value={draft.defaultHeight ?? 320}
                          onChange={(event) =>
                            updateDraft((d) => ({
                              ...d,
                              defaultHeight: Number(event.target.value) || 320,
                            }))
                          }
                          className={textInputClass}
                        />
                      </Field>
                    </div>

                    <label className={checkboxRowClass}>
                      <input
                        type="checkbox"
                        checked={draft.enabled ?? false}
                        onChange={(event) =>
                          updateDraft((d) => ({ ...d, enabled: event.target.checked }))
                        }
                      />
                      <span className="text-sm text-[var(--ds-text)]">
                        {widgetMessages.enabledLabel}
                      </span>
                    </label>

                    <Field
                      label={widgetMessages.descriptionLabel}
                      hint={widgetMessages.descriptionHint}
                    >
                      <textarea
                        rows={3}
                        value={draft.description ?? ""}
                        onChange={(event) =>
                          updateDraft((d) => ({ ...d, description: event.target.value }))
                        }
                        className={textAreaClass}
                      />
                    </Field>

                    <div className={insetCardClass}>
                      <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                        {widgetMessages.configurationTitle}
                      </h3>
                      <p className={fieldHintClass}>
                        {
                          widgetTypeOptions.find((option) => option.value === draft.type)
                            ?.description
                        }
                      </p>

                      {draft.type === "html" ? (
                        <Field
                          label={widgetMessages.types.html.snippetLabel}
                          hint={widgetMessages.types.html.snippetHint}
                        >
                          <textarea
                            rows={14}
                            value={draft.snippet ?? ""}
                            onChange={(event) =>
                              updateDraft((d) => ({ ...d, snippet: event.target.value }))
                            }
                            className={`${textAreaClass} font-mono text-xs`}
                          />
                        </Field>
                      ) : (
                        <Field
                          label={widgetMessages.types.iframe.urlLabel}
                          hint={widgetMessages.types.iframe.urlHint}
                        >
                          <input
                            type="url"
                            value={draft.url ?? ""}
                            onChange={(event) =>
                              updateDraft((d) => ({ ...d, url: event.target.value }))
                            }
                            className={textInputClass}
                          />
                        </Field>
                      )}
                    </div>
                  </Card>

                  <Card className="p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                      {widgetMessages.usageTitle}
                    </h3>
                    <p className={`${fieldHintClass} leading-5`}>
                      {widgetMessages.widgetUsage}:
                      <span className="ml-2 font-mono">[[widget:{draft.key}]]</span>
                    </p>
                    <p className={`${fieldHintClass} leading-5`}>
                      {widgetMessages.imageUsage}:
                      <span className="ml-2 font-mono">
                        [[image:/uploads/datei.jpg alt="Alt" width=320]]
                      </span>
                    </p>
                    <p className={`${fieldHintClass} leading-5`}>
                      {widgetMessages.pdfUsage}:
                      <span className="ml-2 font-mono">
                        {`[[pdf:/uploads/datei.pdf label="${widgetMessages.pdfExampleLabel}"]]`}
                      </span>
                    </p>
                  </Card>
                </div>
              ) : (
                <Card className="flex min-h-[24rem] items-center justify-center p-6 text-sm text-[var(--ds-text-muted)]">
                  {widgetMessages.emptySelection}
                </Card>
              )}
            </PageSplitMain>
          </PageSplitLayout>
        )}
      </PageBody>
    </PageLayout>
  );
}

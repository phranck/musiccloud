import { DownloadIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useReducer } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout, PageSplitAside, PageSplitLayout, PageSplitMain } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import type { MarkdownWidget } from "@/features/system/hooks/useMarkdownWidgets";
import {
  useCreateMarkdownWidget,
  useDeleteMarkdownWidget,
  useMarkdownWidgets,
  useSaveMarkdownWidget,
} from "@/features/system/hooks/useMarkdownWidgets";
import { WidgetEditorPanel } from "@/features/system/WidgetEditorPanel";
import { useKeyboardSave } from "@/lib/useKeyboardSave";

type DraftPatch = Partial<MarkdownWidget>;

function draftFromWidget(widget: MarkdownWidget): DraftPatch {
  return {
    key: widget.key,
    name: widget.name,
    type: widget.type,
    enabled: widget.enabled,
    description: widget.description,
    defaultHeight: widget.defaultHeight,
    snippet: widget.snippet,
    url: widget.url,
  };
}

interface EditorState {
  selectedId: number | null;
  draft: DraftPatch | null;
  savedOk: boolean;
}

type EditorAction =
  | { type: "select"; widget: MarkdownWidget }
  | { type: "clearSelection" }
  | { type: "updateDraft"; updater: (d: DraftPatch) => DraftPatch }
  | { type: "markSaved" };

const editorInitial: EditorState = { selectedId: null, draft: null, savedOk: false };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select":
      return { selectedId: action.widget.id, draft: draftFromWidget(action.widget), savedOk: false };
    case "clearSelection":
      return editorInitial;
    case "updateDraft":
      if (!state.draft) return state;
      return { ...state, draft: action.updater(state.draft), savedOk: false };
    case "markSaved":
      return { ...state, savedOk: true };
  }
}

export function MarkdownWidgetsPage() {
  const { messages } = useI18n();
  const common = messages.common;
  const widgetMessages = messages.content.markdownWidgets;
  const { data: widgets = [], isLoading } = useMarkdownWidgets();
  const saveWidget = useSaveMarkdownWidget();
  const createWidget = useCreateMarkdownWidget();
  const deleteWidget = useDeleteMarkdownWidget();

  const [editor, dispatch] = useReducer(editorReducer, editorInitial);
  const { selectedId, draft, savedOk } = editor;

  // Auto-select first widget on initial load only.
  useEffect(() => {
    if (selectedId === null && widgets.length > 0) {
      dispatch({ type: "select", widget: widgets[0] });
    }
  }, [widgets, selectedId]);

  const selectedWidget = useMemo(() => widgets.find((w) => w.id === selectedId) ?? null, [widgets, selectedId]);

  const widgetTypeOptions = useMemo(
    () => [
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

  function updateDraft(updater: (d: DraftPatch) => DraftPatch) {
    dispatch({ type: "updateDraft", updater });
  }

  function handleAddWidget() {
    createWidget.mutate(
      {
        key: `widget-${widgets.length + 1}`,
        name: `Widget ${widgets.length + 1}`,
        type: "html",
        enabled: true,
        defaultHeight: 320,
      },
      {
        onSuccess: (created) => dispatch({ type: "select", widget: created }),
      },
    );
  }

  function handleDeleteWidget(id: number) {
    deleteWidget.mutate(id, {
      onSuccess: () => {
        if (selectedId !== id) return;
        const next = widgets.find((w) => w.id !== id);
        if (next) dispatch({ type: "select", widget: next });
        else dispatch({ type: "clearSelection" });
      },
    });
  }

  function handleSave() {
    if (!selectedId || !draft) return;
    saveWidget.mutate(
      { id: selectedId, data: draft },
      {
        onSuccess: () => dispatch({ type: "markSaved" }),
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
                    <h2 className="text-sm font-semibold text-[var(--ds-text)]">{widgetMessages.widgetsTitle}</h2>
                    <p className="text-xs text-[var(--ds-text-muted)]">{widgetMessages.widgetsHint}</p>
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
                      const typeLabel = widgetTypeOptions.find((option) => option.value === widget.type)?.label;
                      return (
                        <button
                          key={widget.id}
                          type="button"
                          onClick={() => dispatch({ type: "select", widget })}
                          className={`w-full rounded-card border px-3 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-[var(--color-primary)] bg-[var(--ds-bg-elevated)]"
                              : "border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-[var(--ds-text)]">{widget.name}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${
                                widget.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-stone-500/10 text-stone-400"
                              }`}
                            >
                              {widget.enabled ? widgetMessages.active : widgetMessages.inactive}
                            </span>
                          </div>
                          <div className="mt-1 truncate font-mono text-[0.6875rem] text-[var(--ds-text-muted)]">
                            [[widget:{widget.key}]]
                          </div>
                          <div className="mt-1 text-[0.6875rem] text-[var(--ds-text-muted)]">{typeLabel}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </Card>
            </PageSplitAside>

            <PageSplitMain>
              {draft && selectedWidget ? (
                <WidgetEditorPanel
                  draft={draft}
                  selectedWidgetId={selectedWidget.id}
                  widgetTypeOptions={widgetTypeOptions}
                  messages={widgetMessages}
                  onUpdateDraft={updateDraft}
                  onDelete={handleDeleteWidget}
                />
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

import type { ContentPage, Locale, PageTitleAlignment as PageTitleAlignmentValue } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES } from "@musiccloud/shared";
import { EyeIcon, MarkdownLogoIcon, MinusCircleIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { useI18n } from "@/context/I18nContext";
import { useAdminContentPage, useDeleteContentPage } from "@/features/content/hooks/useAdminContent";
import { LanguageTabs } from "@/features/content/pages/LanguageTabs";
import { PageDisplaySettings } from "@/features/content/pages/PageDisplaySettings";
import { PageTitleAlignment } from "@/features/content/pages/PageTitleAlignment";
import { SegmentManager } from "@/features/content/pages/SegmentManager";
import { useDeleteTranslation } from "@/features/content/pages/usePageTranslations";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import type { MetaFields } from "@/features/content/state/slices/metaSlice";
import { isTranslationDirty } from "@/features/content/state/slices/translationsSlice";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

const FONT_SIZE_KEY = "content-editor-source-font-size";
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_DEFAULT = 13;

function loadFontSize(): number {
  const stored = localStorage.getItem(FONT_SIZE_KEY);
  const parsed = stored ? Number(stored) : Number.NaN;
  return Number.isNaN(parsed) ? FONT_SIZE_DEFAULT : Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, parsed));
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Editor reducer (UI-only state; persistence flows through PagesEditorContext)
// ---------------------------------------------------------------------------

interface EditorState {
  saved: boolean;
  confirmDelete: boolean;
  sourceFontSize: number;
  editingSlug: boolean;
  editSlugValue: string;
  editingTitle: boolean;
  editTitleValue: string;
  patchError: string | null;
}

type EditorAction =
  | { type: "resetForSlug" }
  | { type: "setSaved"; value: boolean }
  | { type: "setConfirmDelete"; value: boolean }
  | { type: "setSourceFontSize"; value: number }
  | { type: "setEditingSlug"; value: boolean }
  | { type: "setEditSlugValue"; value: string }
  | { type: "setEditingTitle"; value: boolean }
  | { type: "setEditTitleValue"; value: string }
  | { type: "setPatchError"; value: string | null };

function createInitialEditorState(): EditorState {
  return {
    saved: false,
    confirmDelete: false,
    sourceFontSize: loadFontSize(),
    editingSlug: false,
    editSlugValue: "",
    editingTitle: false,
    editTitleValue: "",
    patchError: null,
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "resetForSlug":
      return {
        ...state,
        saved: false,
        confirmDelete: false,
        editingSlug: false,
        editingTitle: false,
        patchError: null,
      };
    case "setSaved":
      return { ...state, saved: action.value };
    case "setConfirmDelete":
      return { ...state, confirmDelete: action.value };
    case "setSourceFontSize":
      return { ...state, sourceFontSize: action.value };
    case "setEditingSlug":
      return { ...state, editingSlug: action.value };
    case "setEditSlugValue":
      return { ...state, editSlugValue: action.value };
    case "setEditingTitle":
      return { ...state, editingTitle: action.value };
    case "setEditTitleValue":
      return { ...state, editTitleValue: action.value };
    case "setPatchError":
      return { ...state, patchError: action.value };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EditorHeaderActionsProps {
  sourceFontSize: number;
  canIncreaseFont: boolean;
  canDecreaseFont: boolean;
  editorMessages: {
    decreaseFontSize: string;
    increaseFontSize: string;
    deletePage: string;
    preview: string;
  };
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  onOpenDelete: () => void;
  onPreview: () => void;
}

function EditorHeaderActions({
  sourceFontSize,
  canIncreaseFont,
  canDecreaseFont,
  editorMessages,
  onDecreaseFont,
  onIncreaseFont,
  onOpenDelete,
  onPreview,
}: EditorHeaderActionsProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 border border-[var(--ds-border)] rounded-control px-2 py-1.5 text-[var(--ds-text-muted)]">
        <span className="text-xs font-medium mr-1 select-none">Aa</span>
        <button
          type="button"
          onClick={onDecreaseFont}
          disabled={!canDecreaseFont}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
          title={editorMessages.decreaseFontSize}
        >
          <MinusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
        </button>
        <span className="w-8 text-center text-xs tabular-nums select-none">{sourceFontSize}px</span>
        <button
          type="button"
          onClick={onIncreaseFont}
          disabled={!canIncreaseFont}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
          title={editorMessages.increaseFontSize}
        >
          <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="flex items-center gap-2 px-3 h-8 min-w-8 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-sm font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
      >
        <EyeIcon weight="duotone" className="w-3.5 h-3.5" />
        {editorMessages.preview}
      </button>

      <button
        type="button"
        onClick={onOpenDelete}
        className="flex items-center justify-center w-8 h-8 border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded-control text-sm font-medium hover:bg-[var(--ds-btn-danger-hover-bg)] hover:border-[var(--ds-btn-danger-hover-border)]"
        title={editorMessages.deletePage}
      >
        <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface EditorMetadataBarProps {
  page: ContentPage;
  patchError: string | null;
  editingTitle: boolean;
  editTitleValue: string;
  editingSlug: boolean;
  editSlugValue: string;
  editorMessages: {
    titleLabel: string;
    slugLabel: string;
    statusLabel: string;
    showTitleLabel: string;
    ok: string;
    statusDraft: string;
    statusPublished: string;
    statusHidden: string;
    createdBy: string;
    updatedBy: string;
    updatedAt: string;
  };
  locale: string;
  common: {
    cancel: string;
  };
  onStartEditTitle: () => void;
  onTitleValueChange: (value: string) => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onStartEditSlug: () => void;
  onSlugValueChange: (value: string) => void;
  onSlugBlur: (value: string) => void;
  onSaveSlug: () => void;
  onCancelSlug: () => void;
  onStatusChange: (value: string) => void;
  onShowTitleChange: (value: boolean) => void;
  onTitleAlignmentChange: (value: PageTitleAlignmentValue) => void;
}

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EditorMetadataBar({
  page,
  patchError,
  editingTitle,
  editTitleValue,
  editingSlug,
  editSlugValue,
  editorMessages,
  locale,
  common,
  onStartEditTitle,
  onTitleValueChange,
  onSaveTitle,
  onCancelTitle,
  onStartEditSlug,
  onSlugValueChange,
  onSlugBlur,
  onSaveSlug,
  onCancelSlug,
  onStatusChange,
  onShowTitleChange,
  onTitleAlignmentChange,
}: EditorMetadataBarProps) {
  return (
    <div className="px-3 pt-3 pb-1 flex flex-wrap items-center gap-6 text-xs text-[var(--ds-text-muted)] bg-[var(--ds-surface)]">
      <div className="flex items-center gap-2">
        <span className="font-medium">{editorMessages.titleLabel}:</span>
        {editingTitle ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editTitleValue}
              onChange={(e) => onTitleValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveTitle();
              }}
              className="px-2 py-0.5 text-xs bg-[var(--ds-input-bg)] border border-[var(--color-primary)] rounded text-[var(--ds-text)] focus:outline-none w-48"
            />
            <button type="button" onClick={onSaveTitle} className="text-[var(--color-primary)] hover:underline">
              {editorMessages.ok}
            </button>
            <button type="button" onClick={onCancelTitle} className="hover:underline">
              {common.cancel}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onStartEditTitle} className="hover:underline text-[var(--ds-text)]">
            {page.title}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">{editorMessages.slugLabel}:</span>
        {editingSlug ? (
          <div className="flex items-center gap-1">
            <span className="text-[var(--ds-text-muted)]">/</span>
            <input
              type="text"
              value={editSlugValue}
              onChange={(e) => onSlugValueChange(e.target.value)}
              onBlur={(e) => onSlugBlur(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveSlug();
              }}
              pattern="[a-z0-9-]+"
              className="px-2 py-0.5 text-xs bg-[var(--ds-input-bg)] border border-[var(--color-primary)] rounded text-[var(--ds-text)] focus:outline-none font-mono w-40"
            />
            <button type="button" onClick={onSaveSlug} className="text-[var(--color-primary)] hover:underline">
              {editorMessages.ok}
            </button>
            <button type="button" onClick={onCancelSlug} className="hover:underline">
              {common.cancel}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onStartEditSlug} className="hover:underline font-mono text-[var(--ds-text)]">
            /{page.slug}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">{editorMessages.statusLabel}:</span>
        <select
          value={page.status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 text-[var(--ds-text)] focus:outline-none cursor-pointer"
        >
          <option value="draft">{editorMessages.statusDraft}</option>
          <option value="published">{editorMessages.statusPublished}</option>
          <option value="hidden">{editorMessages.statusHidden}</option>
        </select>
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={page.showTitle}
          onChange={(e) => onShowTitleChange(e.target.checked)}
          className="accent-[var(--color-primary)] cursor-pointer"
        />
        <span className="font-medium">{editorMessages.showTitleLabel}</span>
      </label>

      {page.showTitle && <PageTitleAlignment value={page.titleAlignment} onChange={onTitleAlignmentChange} />}

      {page.createdByUsername && (
        <div className="ml-auto flex flex-col items-end gap-0.5 leading-tight">
          <div>
            {editorMessages.createdBy} <span className="text-[var(--ds-text)]">{page.createdByUsername}</span>
            {page.updatedByUsername && (
              <>
                {" "}
                · {editorMessages.updatedBy} <span className="text-[var(--ds-text)]">{page.updatedByUsername}</span>
              </>
            )}
          </div>
          {page.updatedAt && (
            <div>
              {editorMessages.updatedAt}{" "}
              <span className="text-[var(--ds-text)]">{formatDateTime(page.updatedAt, locale)}</span>
            </div>
          )}
        </div>
      )}

      {patchError && <span className="text-red-500">{patchError}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Markdown content editor page for one content slug.
 *
 * @returns Full editor route component.
 */
export function ContentEditorPage() {
  const { messages, locale } = useI18n();
  const common = messages.common;
  const editorMessages = messages.content.editor;
  const pageMessages = messages.content.pages;
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: page, isLoading } = useAdminContentPage(slug);
  const deletePage = useDeleteContentPage();
  const deleteTranslation = useDeleteTranslation(slug);
  const { phase: savedPhase } = useSaveNotification();
  const editor = usePagesEditor();

  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialEditorState);

  // Active locale tab
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE);

  // Reset transient UI state and locale tab when navigating to a different slug.
  useEffect(() => {
    void slug;
    dispatch({ type: "resetForSlug" });
    setActiveLocale(DEFAULT_LOCALE);
  }, [slug]);

  // Hydrate slice context from server data on mount and on page-data refresh.
  useEffect(() => {
    if (!page) return;
    editor.dispatch.meta({ type: "hydrate", entries: [{ slug: page.slug, meta: page }] });
    editor.dispatch.content({ type: "hydrate", entries: [{ slug: page.slug, content: page.content }] });
    editor.dispatch.translations({
      type: "hydrate",
      entries: (page.translations ?? []).map((t) => ({
        slug: page.slug,
        locale: t.locale,
        title: t.title,
        content: t.content,
        translationReady: t.translationReady,
      })),
    });
  }, [page, editor.dispatch]);

  // ---------------------------------------------------------------------------
  // Slice readers — reflect live edits, fall back to server data on first paint.
  // ---------------------------------------------------------------------------

  const metaCurrent = page ? (editor.meta.pages[page.slug]?.current ?? page) : null;
  const contentCurrent = page ? (editor.content.pages[page.slug]?.current ?? page.content) : "";
  const translationCurrent = (loc: Locale) =>
    page ? editor.translations.byPage[page.slug]?.[loc]?.current : undefined;

  const setMeta = useCallback(
    <K extends keyof MetaFields>(field: K, value: MetaFields[K]) => {
      if (!page) return;
      editor.dispatch.meta({ type: "set-field", slug: page.slug, field, value });
    },
    [page, editor.dispatch],
  );

  const handleChange = useCallback(
    (markdown: string) => {
      if (!page) return;
      if (activeLocale === DEFAULT_LOCALE) {
        editor.dispatch.content({ type: "set", slug: page.slug, value: markdown });
      } else {
        editor.dispatch.translations({
          type: "set-field",
          slug: page.slug,
          locale: activeLocale,
          field: "content",
          value: markdown,
        });
      }
    },
    [activeLocale, page, editor.dispatch],
  );

  const currentContent =
    activeLocale === DEFAULT_LOCALE ? contentCurrent : (translationCurrent(activeLocale)?.content ?? "");

  const changeFontSize = (delta: number) => {
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, state.sourceFontSize + delta));
    localStorage.setItem(FONT_SIZE_KEY, String(next));
    dispatch({ type: "setSourceFontSize", value: next });
  };

  function handleTitleSave() {
    setMeta("title", state.editTitleValue);
    dispatch({ type: "setEditingTitle", value: false });
  }

  function handleSlugSave() {
    setMeta("slug", state.editSlugValue);
    dispatch({ type: "setEditingSlug", value: false });
    // Note: the URL still reflects the old slug until the bulk save persists
    // the rename and triggers a refetch. URL redirect after save lives in a
    // later task (see plan T22 drift-note about useGlobalPagesSave).
  }

  // ---------------------------------------------------------------------------
  // Locale tab helpers
  // ---------------------------------------------------------------------------

  const statuses = page?.translationStatus ?? ({} as ContentPage["translationStatus"]);

  const tabStates = Object.fromEntries(
    LOCALES.map((loc) => [
      loc,
      {
        status: statuses[loc] ?? "missing",
        dirty: page ? isTranslationDirty(editor.translations, page.slug, loc) : false,
      },
    ]),
  ) as Record<Locale, { status: ContentPage["translationStatus"][Locale]; dirty: boolean }>;

  function handleCreateTranslation() {
    if (!page) return;
    editor.dispatch.translations({
      type: "add-locale",
      slug: page.slug,
      locale: activeLocale,
      fields: {
        title: metaCurrent?.title ?? page.title,
        content: contentCurrent || page.content,
        translationReady: false,
      },
    });
  }

  function handleDeleteTranslation() {
    if (!window.confirm(`Delete ${activeLocale.toUpperCase()} translation?`)) return;
    deleteTranslation.mutate(activeLocale, {
      onSuccess: () => {
        // Slice will re-hydrate from refreshed page query without the locale.
        setActiveLocale(DEFAULT_LOCALE);
      },
    });
  }

  function handleTabSelect(loc: Locale) {
    setActiveLocale(loc);
  }

  const title = metaCurrent?.title ?? slug;

  const activeTranslation = activeLocale === DEFAULT_LOCALE ? undefined : translationCurrent(activeLocale);
  const hasActiveTranslation = activeLocale === DEFAULT_LOCALE || activeTranslation !== undefined;

  return (
    <PageLayout>
      <PageHeader
        title={title}
        leading={<HeaderBackButton label={messages.content.pages.title} onClick={() => navigate("/pages")} />}
      >
        <SaveNotification phase={savedPhase} label={common.saved} />
        <EditorHeaderActions
          sourceFontSize={state.sourceFontSize}
          canIncreaseFont={state.sourceFontSize < FONT_SIZE_MAX}
          canDecreaseFont={state.sourceFontSize > FONT_SIZE_MIN}
          editorMessages={editorMessages}
          onDecreaseFont={() => changeFontSize(-1)}
          onIncreaseFont={() => changeFontSize(+1)}
          onOpenDelete={() => dispatch({ type: "setConfirmDelete", value: true })}
          onPreview={() => {
            const base =
              (import.meta.env.VITE_FRONTEND_URL as string | undefined) ??
              (import.meta.env.DEV ? "http://localhost:3000" : "https://musiccloud.io");
            window.open(`${base}/${slug}`, "_blank");
          }}
        />
      </PageHeader>

      {page && metaCurrent && (
        <EditorMetadataBar
          page={{ ...page, ...metaCurrent } as ContentPage}
          patchError={state.patchError}
          editingTitle={state.editingTitle}
          editTitleValue={state.editTitleValue}
          editingSlug={state.editingSlug}
          editSlugValue={state.editSlugValue}
          editorMessages={editorMessages}
          locale={locale}
          common={common}
          onStartEditTitle={() => {
            dispatch({ type: "setEditTitleValue", value: metaCurrent.title });
            dispatch({ type: "setEditingTitle", value: true });
          }}
          onTitleValueChange={(value) => dispatch({ type: "setEditTitleValue", value })}
          onSaveTitle={handleTitleSave}
          onCancelTitle={() => dispatch({ type: "setEditingTitle", value: false })}
          onStartEditSlug={() => {
            dispatch({ type: "setEditSlugValue", value: metaCurrent.slug });
            dispatch({ type: "setEditingSlug", value: true });
          }}
          onSlugValueChange={(value) => dispatch({ type: "setEditSlugValue", value })}
          onSlugBlur={(value) => dispatch({ type: "setEditSlugValue", value: slugify(value) })}
          onSaveSlug={handleSlugSave}
          onCancelSlug={() => dispatch({ type: "setEditingSlug", value: false })}
          onStatusChange={(value) => setMeta("status", value as "draft" | "published" | "hidden")}
          onShowTitleChange={(value) => setMeta("showTitle", value)}
          onTitleAlignmentChange={(value) => setMeta("titleAlignment", value)}
        />
      )}

      {page && metaCurrent && (
        <PageDisplaySettings
          displayMode={metaCurrent.displayMode}
          overlayWidth={metaCurrent.overlayWidth}
          contentCardStyle={metaCurrent.contentCardStyle}
          onChange={(patch) => {
            if (patch.displayMode !== undefined) setMeta("displayMode", patch.displayMode);
            if (patch.overlayWidth !== undefined) setMeta("overlayWidth", patch.overlayWidth);
            if (patch.contentCardStyle !== undefined) setMeta("contentCardStyle", patch.contentCardStyle);
          }}
        />
      )}

      {page && page.pageType === "segmented" ? (
        <PageBody className="overflow-visible flex flex-col gap-3">
          {isLoading && (
            <div className="flex items-center justify-center h-64 text-[var(--ds-text-subtle)] text-sm">
              {editorMessages.loadingContent}
            </div>
          )}
          <SegmentManager page={page} />
        </PageBody>
      ) : (
        <DashboardSection>
          <DashboardSection.Header icon={<MarkdownLogoIcon weight="duotone" className="w-4 h-4" />} title={title} />

          {/* Language tabs */}
          {page && (
            <div className="px-3 pt-3">
              <LanguageTabs active={activeLocale} states={tabStates} onSelect={handleTabSelect} />
            </div>
          )}

          {/* Translation title field (non-default locales only) */}
          {page && activeLocale !== DEFAULT_LOCALE && activeTranslation && (
            <div className="px-3 pt-3 flex items-center gap-3">
              <label
                htmlFor="translation-title-input"
                className="text-xs font-medium text-[var(--ds-text-muted)] shrink-0"
              >
                Title ({activeLocale.toUpperCase()}):
              </label>
              <input
                id="translation-title-input"
                type="text"
                value={activeTranslation.title ?? ""}
                onChange={(e) =>
                  editor.dispatch.translations({
                    type: "set-field",
                    slug: page.slug,
                    locale: activeLocale,
                    field: "title",
                    value: e.target.value,
                  })
                }
                className="flex-1 px-2 py-1 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--ds-text-muted)] cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={activeTranslation.translationReady ?? false}
                  onChange={(e) =>
                    editor.dispatch.translations({
                      type: "set-field",
                      slug: page.slug,
                      locale: activeLocale,
                      field: "translationReady",
                      value: e.target.checked,
                    })
                  }
                  className="accent-[var(--color-primary)] cursor-pointer"
                />
                Translation ready
              </label>
              <button
                type="button"
                onClick={handleDeleteTranslation}
                disabled={deleteTranslation.isPending}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded hover:bg-[var(--ds-btn-danger-hover-bg)] disabled:opacity-60"
              >
                <TrashIcon weight="duotone" className="w-3 h-3" />
                Delete translation
              </button>
            </div>
          )}

          <PageBody
            className="overflow-hidden"
            style={{ "--source-font-size": `${state.sourceFontSize}px` } as React.CSSProperties}
          >
            {isLoading && (
              <div className="flex items-center justify-center h-64 text-[var(--ds-text-subtle)] text-sm">
                {editorMessages.loadingContent}
              </div>
            )}
            {page && !hasActiveTranslation ? (
              /* No translation yet: offer to create one */
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <p className="text-sm text-[var(--ds-text-muted)]">No {activeLocale.toUpperCase()} translation yet.</p>
                <button
                  type="button"
                  onClick={handleCreateTranslation}
                  className="flex items-center gap-2 px-4 py-2 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)]"
                >
                  Create translation from {DEFAULT_LOCALE.toUpperCase()}
                </button>
              </div>
            ) : (
              page && (
                <Suspense fallback={<div className="h-64 bg-[var(--ds-input-bg)] animate-pulse" />}>
                  <MarkdownEditor
                    key={`${slug}-${activeLocale}`}
                    value={currentContent}
                    onChange={handleChange}
                    height="100%"
                    showHints
                  />
                </Suspense>
              )
            )}
          </PageBody>
        </DashboardSection>
      )}
      <Dialog
        open={state.confirmDelete}
        title={pageMessages.deletePageTitle}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => dispatch({ type: "setConfirmDelete", value: false })}
      >
        <div className="p-6 text-sm text-[var(--ds-text)]">
          {pageMessages.confirmDeletePrefix} „<span className="font-bold">{title}</span>"{" "}
          {pageMessages.confirmDeleteSuffix}
        </div>
        <Dialog.Footer>
          <button
            type="button"
            className={dialogBtnSecondary}
            onClick={() => dispatch({ type: "setConfirmDelete", value: false })}
            disabled={deletePage.isPending}
          >
            {common.cancel}
          </button>
          <button
            type="button"
            className={dialogBtnDestructive}
            onClick={() => {
              deletePage.mutate(slug, { onSuccess: () => navigate("/pages") });
            }}
            disabled={deletePage.isPending}
          >
            {deletePage.isPending ? "…" : common.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}

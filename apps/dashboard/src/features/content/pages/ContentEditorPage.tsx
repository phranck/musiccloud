import type { ContentPage, Locale, PageTitleAlignment as PageTitleAlignmentValue } from "@musiccloud/shared";
import { DEFAULT_LOCALE, getLocalizedText, LOCALES } from "@musiccloud/shared";
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
import { buildLocalizedPageTitle, createPageTitleTranslationDraft } from "@/features/content/pageLocalization";
import { LanguageTabs } from "@/features/content/pages/LanguageTabs";
import { PageDisplaySettings } from "@/features/content/pages/PageDisplaySettings";
import { PageTitleAlignment } from "@/features/content/pages/PageTitleAlignment";
import { SegmentManager } from "@/features/content/pages/SegmentManager";
import { useDeleteTranslation } from "@/features/content/pages/usePageTranslations";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { isContentDirty } from "@/features/content/state/slices/contentSlice";
import type { MetaFields } from "@/features/content/state/slices/metaSlice";
import { isMetaFieldDirty } from "@/features/content/state/slices/metaSlice";
import { isTranslationDirty } from "@/features/content/state/slices/translationsSlice";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

const FONT_SIZE_KEY = "content-editor-source-font-size";
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_DEFAULT = 13;
const FRONTEND_PREVIEW_BASE_URL = import.meta.env.DEV ? "http://localhost:3000" : "https://musiccloud.io";

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
  patchError: string | null;
}

type EditorAction =
  | { type: "resetForSlug" }
  | { type: "setSaved"; value: boolean }
  | { type: "setConfirmDelete"; value: boolean }
  | { type: "setSourceFontSize"; value: number }
  | { type: "setEditingSlug"; value: boolean }
  | { type: "setEditSlugValue"; value: string }
  | { type: "setPatchError"; value: string | null };

function createInitialEditorState(): EditorState {
  return {
    saved: false,
    confirmDelete: false,
    sourceFontSize: loadFontSize(),
    editingSlug: false,
    editSlugValue: "",
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
    case "setPatchError":
      return { ...state, patchError: action.value };
    default:
      return state;
  }
}

type PageEditorDispatch = ReturnType<typeof usePagesEditor>["dispatch"];

function useHydratePageEditor(page: ContentPage | undefined, editorDispatch: PageEditorDispatch) {
  useEffect(() => {
    if (!page) return;
    editorDispatch.meta({ type: "hydrate", entries: [{ slug: page.slug, meta: page }] });
    editorDispatch.content({ type: "hydrate", entries: [{ slug: page.slug, content: page.content }] });
    editorDispatch.translations({
      type: "hydrate",
      entries: (page.translations ?? []).map((translation) => ({
        slug: page.slug,
        locale: translation.locale,
        title: translation.title,
        content: translation.content,
        translationReady: translation.translationReady,
      })),
    });
    if (page.pageType === "segmented") {
      editorDispatch.segments({
        type: "hydrate-owner",
        ownerSlug: page.slug,
        segments: page.segments.map((segment) => ({
          position: segment.position,
          label: segment.label,
          targetSlug: segment.targetSlug,
          translations: segment.translations,
        })),
      });
    }
  }, [page, editorDispatch]);
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
          className="size-5 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
          title={editorMessages.decreaseFontSize}
        >
          <MinusCircleIcon weight="duotone" className="size-3.5" />
        </button>
        <span className="w-8 text-center text-xs tabular-nums select-none">{sourceFontSize}px</span>
        <button
          type="button"
          onClick={onIncreaseFont}
          disabled={!canIncreaseFont}
          className="size-5 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
          title={editorMessages.increaseFontSize}
        >
          <PlusCircleIcon weight="duotone" className="size-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="flex items-center gap-2 px-3 h-8 min-w-8 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-sm font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
      >
        <EyeIcon weight="duotone" className="size-3.5" />
        {editorMessages.preview}
      </button>

      <button
        type="button"
        onClick={onOpenDelete}
        className="flex size-8 items-center justify-center border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded-control text-sm font-medium hover:bg-[var(--ds-btn-danger-hover-bg)] hover:border-[var(--ds-btn-danger-hover-border)]"
        title={editorMessages.deletePage}
      >
        <TrashIcon weight="duotone" className="size-3.5" />
      </button>
    </div>
  );
}

type SavePhase = ReturnType<typeof useSaveNotification>["phase"];

interface ContentEditorHeaderProps {
  title: string;
  backLabel: string;
  savedPhase: SavePhase;
  savedLabel: string;
  sourceFontSize: number;
  editorMessages: EditorHeaderActionsProps["editorMessages"];
  onBack: () => void;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  onOpenDelete: () => void;
  onPreview: () => void;
}

function ContentEditorHeader({
  title,
  backLabel,
  savedPhase,
  savedLabel,
  sourceFontSize,
  editorMessages,
  onBack,
  onDecreaseFont,
  onIncreaseFont,
  onOpenDelete,
  onPreview,
}: ContentEditorHeaderProps) {
  return (
    <PageHeader title={title} leading={<HeaderBackButton label={backLabel} onClick={onBack} />}>
      <SaveNotification phase={savedPhase} label={savedLabel} />
      <EditorHeaderActions
        sourceFontSize={sourceFontSize}
        canIncreaseFont={sourceFontSize < FONT_SIZE_MAX}
        canDecreaseFont={sourceFontSize > FONT_SIZE_MIN}
        editorMessages={editorMessages}
        onDecreaseFont={onDecreaseFont}
        onIncreaseFont={onIncreaseFont}
        onOpenDelete={onOpenDelete}
        onPreview={onPreview}
      />
    </PageHeader>
  );
}

interface EditorMetadataBarProps {
  page: ContentPage;
  patchError: string | null;
  editingSlug: boolean;
  editSlugValue: string;
  editorMessages: {
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
  editingSlug,
  editSlugValue,
  editorMessages,
  locale,
  common,
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

interface PageTitleLocalizationFieldProps {
  label: string;
  locale: Locale;
  value: string;
  fallback: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function PageTitleLocalizationField({
  label,
  locale,
  value,
  fallback,
  placeholder,
  onChange,
}: PageTitleLocalizationFieldProps) {
  const localeLabel = locale.toUpperCase();

  return (
    <div className="px-3 pt-3">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
          {label}
          <span className="px-1.5 py-0.5 rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] font-mono text-[10px] leading-none text-[var(--ds-text-subtle)]">
            {localeLabel}
          </span>
        </span>
        <input
          type="text"
          aria-label={`${label} ${localeLabel}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback || placeholder}
          className="h-10 w-full rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
      </label>
    </div>
  );
}

interface TranslationControlRowProps {
  translationReady: boolean;
  deletePending: boolean;
  onTranslationReadyChange: (value: boolean) => void;
  onDeleteTranslation: () => void;
}

function TranslationControlRow({
  translationReady,
  deletePending,
  onTranslationReadyChange,
  onDeleteTranslation,
}: TranslationControlRowProps) {
  return (
    <div className="px-3 pt-3 flex items-center justify-end gap-3 text-xs text-[var(--ds-text-muted)]">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={translationReady}
          onChange={(event) => onTranslationReadyChange(event.target.checked)}
          className="accent-[var(--color-primary)] cursor-pointer"
        />
        Translation ready
      </label>
      <button
        type="button"
        onClick={onDeleteTranslation}
        disabled={deletePending}
        className="flex items-center gap-1 px-2 py-1 border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded hover:bg-[var(--ds-btn-danger-hover-bg)] disabled:opacity-60"
      >
        <TrashIcon weight="duotone" className="size-3" />
        Delete translation
      </button>
    </div>
  );
}

interface EditorContentSurfaceProps {
  page: ContentPage;
  slug: string;
  activeLocale: Locale;
  hasActiveTranslation: boolean;
  headerTitle: string;
  currentContent: string;
  sourceFontSize: number;
  isLoading: boolean;
  loadingLabel: string;
  onCreateTranslation: () => void;
  onMarkdownChange: (markdown: string) => void;
}

function EditorContentSurface({
  page,
  slug,
  activeLocale,
  hasActiveTranslation,
  headerTitle,
  currentContent,
  sourceFontSize,
  isLoading,
  loadingLabel,
  onCreateTranslation,
  onMarkdownChange,
}: EditorContentSurfaceProps) {
  if (page.pageType === "segmented") {
    return (
      <PageBody className="overflow-visible flex flex-col gap-3">
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-[var(--ds-text-subtle)] text-sm">
            {loadingLabel}
          </div>
        )}
        <SegmentManager page={page} activeLocale={activeLocale} />
      </PageBody>
    );
  }

  return (
    <DashboardSection>
      <DashboardSection.Header icon={<MarkdownLogoIcon weight="duotone" className="size-4" />} title={headerTitle} />
      <PageBody
        className="overflow-hidden"
        style={{ "--source-font-size": `${sourceFontSize}px` } as React.CSSProperties}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-[var(--ds-text-subtle)] text-sm">
            {loadingLabel}
          </div>
        )}
        {!hasActiveTranslation ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-sm text-[var(--ds-text-muted)]">No {activeLocale.toUpperCase()} translation yet.</p>
            <button
              type="button"
              onClick={onCreateTranslation}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)]"
            >
              Create translation from {DEFAULT_LOCALE.toUpperCase()}
            </button>
          </div>
        ) : (
          <Suspense fallback={<div className="h-64 bg-[var(--ds-input-bg)] animate-pulse" />}>
            <MarkdownEditor
              key={`${slug}-${activeLocale}`}
              value={currentContent}
              onChange={onMarkdownChange}
              height="100%"
              showHints
            />
          </Suspense>
        )}
      </PageBody>
    </DashboardSection>
  );
}

interface DeletePageDialogProps {
  open: boolean;
  title: string;
  pending: boolean;
  messages: {
    deletePageTitle: string;
    confirmDeletePrefix: string;
    confirmDeleteSuffix: string;
  };
  common: {
    cancel: string;
    delete: string;
  };
  onClose: () => void;
  onDelete: () => void;
}

function DeletePageDialog({ open, title, pending, messages, common, onClose, onDelete }: DeletePageDialogProps) {
  return (
    <Dialog
      open={open}
      title={messages.deletePageTitle}
      titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onClose}
    >
      <div className="p-6 text-sm text-[var(--ds-text)]">
        {messages.confirmDeletePrefix} „<span className="font-bold">{title}</span>" {messages.confirmDeleteSuffix}
      </div>
      <Dialog.Footer>
        <button type="button" className={dialogBtnSecondary} onClick={onClose} disabled={pending}>
          {common.cancel}
        </button>
        <button type="button" className={dialogBtnDestructive} onClick={onDelete} disabled={pending}>
          {pending ? "…" : common.delete}
        </button>
      </Dialog.Footer>
    </Dialog>
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

  useHydratePageEditor(page, editor.dispatch);

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

  const handleMarkdownChange = useCallback(
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

  function handleTitleChange(value: string) {
    if (!page) return;
    if (activeLocale === DEFAULT_LOCALE) {
      setMeta("title", value);
    } else if (translationCurrent(activeLocale) !== undefined) {
      editor.dispatch.translations({
        type: "set-field",
        slug: page.slug,
        locale: activeLocale,
        field: "title",
        value,
      });
    } else {
      editor.dispatch.translations({
        type: "add-locale",
        slug: page.slug,
        locale: activeLocale,
        fields: createPageTitleTranslationDraft({
          title: value,
          content: contentCurrent || page.content,
          pageType: page.pageType,
        }),
      });
    }
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
        dirty: page
          ? loc === DEFAULT_LOCALE
            ? isMetaFieldDirty(editor.meta, page.slug, "title") || isContentDirty(editor.content, page.slug)
            : isTranslationDirty(editor.translations, page.slug, loc)
          : false,
      },
    ]),
  ) as Record<Locale, { status: ContentPage["translationStatus"][Locale]; dirty: boolean }>;

  function handleCreateTranslation() {
    if (!page) return;
    editor.dispatch.translations({
      type: "add-locale",
      slug: page.slug,
      locale: activeLocale,
      fields: createPageTitleTranslationDraft({
        title: activeTitle.value || activeTitle.fallback || metaCurrent?.title || page.title,
        content: contentCurrent || page.content,
        pageType: page.pageType,
      }),
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

  const baseTitle = metaCurrent?.title ?? slug;
  const localizedTitle = page
    ? buildLocalizedPageTitle(baseTitle, page.translations, editor.translations.byPage[page.slug])
    : {};
  const activeTitle = getLocalizedText(localizedTitle, activeLocale, DEFAULT_LOCALE);

  const activeTranslation = activeLocale === DEFAULT_LOCALE ? undefined : translationCurrent(activeLocale);
  const hasActiveTranslation = activeLocale === DEFAULT_LOCALE || activeTranslation !== undefined;

  // The editable page-title field follows the active locale tab.
  const displayTitle = activeTitle.value;
  // Page-header title falls back to the base when a translation has no title yet.
  const headerTitle = displayTitle || activeTitle.fallback || baseTitle;

  return (
    <PageLayout>
      <ContentEditorHeader
        title={headerTitle}
        backLabel={messages.content.pages.title}
        savedPhase={savedPhase}
        savedLabel={common.saved}
        sourceFontSize={state.sourceFontSize}
        editorMessages={editorMessages}
        onBack={() => navigate("/pages")}
        onDecreaseFont={() => changeFontSize(-1)}
        onIncreaseFont={() => changeFontSize(+1)}
        onOpenDelete={() => dispatch({ type: "setConfirmDelete", value: true })}
        onPreview={() => {
          window.open(`${FRONTEND_PREVIEW_BASE_URL}/${slug}`, "_blank");
        }}
      />

      {page && metaCurrent && (
        <EditorMetadataBar
          page={{ ...page, ...metaCurrent } as ContentPage}
          patchError={state.patchError}
          editingSlug={state.editingSlug}
          editSlugValue={state.editSlugValue}
          editorMessages={editorMessages}
          locale={locale}
          common={common}
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

      {/* Locale tabs define the localization context for the page title,
          SegmentManager, and markdown content below. */}
      {page && (
        <div className="px-3 pt-3">
          <LanguageTabs active={activeLocale} states={tabStates} onSelect={handleTabSelect} />
        </div>
      )}

      {page && (
        <PageTitleLocalizationField
          label={editorMessages.pageTitleLabel}
          locale={activeLocale}
          value={displayTitle}
          fallback={activeTitle.fallback}
          placeholder={pageMessages.titlePlaceholder}
          onChange={handleTitleChange}
        />
      )}

      {/* Translation control row — shared by both page types. The title field
          above may auto-create a translation; this row appears once it exists. */}
      {page && activeLocale !== DEFAULT_LOCALE && activeTranslation && (
        <TranslationControlRow
          translationReady={activeTranslation.translationReady ?? false}
          deletePending={deleteTranslation.isPending}
          onTranslationReadyChange={(value) =>
            editor.dispatch.translations({
              type: "set-field",
              slug: page.slug,
              locale: activeLocale,
              field: "translationReady",
              value,
            })
          }
          onDeleteTranslation={handleDeleteTranslation}
        />
      )}

      {page && (
        <EditorContentSurface
          page={page}
          slug={slug}
          activeLocale={activeLocale}
          hasActiveTranslation={hasActiveTranslation}
          headerTitle={headerTitle}
          currentContent={currentContent}
          sourceFontSize={state.sourceFontSize}
          isLoading={isLoading}
          loadingLabel={editorMessages.loadingContent}
          onCreateTranslation={handleCreateTranslation}
          onMarkdownChange={handleMarkdownChange}
        />
      )}
      <DeletePageDialog
        open={state.confirmDelete}
        title={baseTitle}
        pending={deletePage.isPending}
        messages={pageMessages}
        common={common}
        onClose={() => dispatch({ type: "setConfirmDelete", value: false })}
        onDelete={() => {
          deletePage.mutate(slug, { onSuccess: () => navigate("/pages") });
        }}
      />
    </PageLayout>
  );
}

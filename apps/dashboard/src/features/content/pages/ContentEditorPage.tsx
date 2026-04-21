import type {
  ContentPage,
  Locale,
  OverlayWidth,
  PageDisplayMode,
  PageTitleAlignment as PageTitleAlignmentValue,
} from "@musiccloud/shared";
import {
  DEFAULT_LOCALE,
  LOCALES,
} from "@musiccloud/shared";
import {
  DownloadIcon,
  EyeIcon,
  MarkdownLogoIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { useI18n } from "@/context/I18nContext";
import {
  useAdminContentPage,
  useDeleteContentPage,
  usePatchContentPage,
  useSaveContentPage,
} from "@/features/content/hooks/useAdminContent";
import { LanguageTabs } from "@/features/content/pages/LanguageTabs";
import { PageDisplaySettings } from "@/features/content/pages/PageDisplaySettings";
import { PageTitleAlignment } from "@/features/content/pages/PageTitleAlignment";
import { SegmentManager, type SegmentSaveFn } from "@/features/content/pages/SegmentManager";
import { useSaveTranslation, useDeleteTranslation } from "@/features/content/pages/usePageTranslations";
import { useKeyboardSave } from "@/lib/useKeyboardSave";

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
// Per-locale form state
// ---------------------------------------------------------------------------

interface LocaleFormState {
  title: string;
  content: string;
  translationReady: boolean;
  dirty: boolean;
}

type LocaleForms = Record<Locale, LocaleFormState | undefined>;

function buildInitialForms(page: ContentPage): LocaleForms {
  const forms = {} as LocaleForms;

  // Default locale seeded from page root fields
  forms[DEFAULT_LOCALE] = {
    title: page.title,
    content: page.content,
    translationReady: true,
    dirty: false,
  };

  // Non-default locales seeded from page.translations array
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const existing = page.translations.find((t) => t.locale === locale);
    if (existing) {
      forms[locale] = {
        title: existing.title,
        content: existing.content,
        translationReady: existing.translationReady,
        dirty: false,
      };
    } else {
      forms[locale] = undefined;
    }
  }

  return forms;
}

// ---------------------------------------------------------------------------
// Editor reducer
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
  draftContent: string | null;
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
  | { type: "setPatchError"; value: string | null }
  | { type: "setDraftContent"; value: string | null };

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
    draftContent: null,
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
        draftContent: null,
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
    case "setDraftContent":
      return { ...state, draftContent: action.value };
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
  confirmDelete: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  saved: boolean;
  common: {
    cancel: string;
    save: string;
    saving: string;
  };
  editorMessages: {
    decreaseFontSize: string;
    increaseFontSize: string;
    deletePage: string;
    confirmDelete: string;
    confirmDeleteAction: string;
    saved: string;
    preview: string;
  };
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  onOpenDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onSave: () => void;
  onPreview: () => void;
}

function EditorHeaderActions({
  sourceFontSize,
  canIncreaseFont,
  canDecreaseFont,
  confirmDelete,
  isDeleting,
  isSaving: _isSaving,
  saved,
  common,
  editorMessages,
  onDecreaseFont,
  onIncreaseFont,
  onOpenDelete,
  onCancelDelete,
  onConfirmDelete,
  onSave,
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
        onClick={onSave}
        disabled={_isSaving}
        className="flex items-center gap-2 h-8 min-w-8 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-60"
      >
        <DownloadIcon weight="duotone" className="w-3.5 h-3.5" />
        {saved ? editorMessages.saved : common.save}
      </button>

      {!confirmDelete ? (
        <button
          type="button"
          onClick={onOpenDelete}
          className="flex items-center justify-center w-8 h-8 border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded-control text-sm font-medium hover:bg-[var(--ds-btn-danger-hover-bg)] hover:border-[var(--ds-btn-danger-hover-border)]"
          title={editorMessages.deletePage}
        >
          <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 h-8 border border-[var(--ds-btn-danger-border)] rounded-control bg-[var(--ds-btn-danger-hover-bg)]">
          <span className="text-xs text-[var(--ds-btn-danger-text)] font-medium">{editorMessages.confirmDelete}</span>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="text-xs font-semibold text-[var(--ds-btn-danger-text)] hover:underline disabled:opacity-60"
          >
            {editorMessages.confirmDeleteAction}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="text-xs text-[var(--ds-text-muted)] hover:underline"
          >
            {common.cancel}
          </button>
        </div>
      )}
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
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: page, isLoading } = useAdminContentPage(slug);
  const save = useSaveContentPage();
  const patch = usePatchContentPage();
  const deletePage = useDeleteContentPage();
  const saveTranslation = useSaveTranslation(slug);
  const deleteTranslation = useDeleteTranslation(slug);
  const { phase: savedPhase, show: showSaved } = useSaveNotification();
  const segmentSaveRef = useRef<SegmentSaveFn | null>(null);

  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialEditorState);

  // Active locale tab
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE);

  // Per-locale form state — initialised once the page data arrives.
  // We keep it in a ref-backed useState so tab switches never lose data.
  const [localeForms, setLocaleForms] = useState<LocaleForms>(() => {
    const empty = {} as LocaleForms;
    for (const loc of LOCALES) empty[loc] = undefined;
    return empty;
  });

  // Ref used by both effects below — must be declared before them.
  const formsSeededRef = useRef<string | null>(null);

  // Reset fires FIRST so that when slug changes and page data is already cached,
  // the seed effect (below) can immediately re-seed in the same render cycle.
  useEffect(() => {
    void slug;
    dispatch({ type: "resetForSlug" });
    // Reset locale tab and forms when navigating to a different slug
    setActiveLocale(DEFAULT_LOCALE);
    formsSeededRef.current = null;
    setLocaleForms(() => {
      const empty = {} as LocaleForms;
      for (const loc of LOCALES) empty[loc] = undefined;
      return empty;
    });
  }, [slug]);

  // Seed locale forms when page data first loads (or slug changes).
  useEffect(() => {
    if (page && formsSeededRef.current !== slug) {
      formsSeededRef.current = slug;
      setLocaleForms(buildInitialForms(page));
    }
  }, [page, slug]);

  // beforeunload guard while any locale has unsaved changes
  useEffect(() => {
    const isDirty = Object.values(localeForms).some((f) => f?.dirty);
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [localeForms]);

  // ---------------------------------------------------------------------------
  // Default-locale: content is tracked via draftContent (legacy path) AND
  // synced into localeForms so the two stay consistent.
  // ---------------------------------------------------------------------------

  const handleChange = useCallback(
    (markdown: string) => {
      dispatch({ type: "setSaved", value: false });
      if (activeLocale === DEFAULT_LOCALE) {
        dispatch({ type: "setDraftContent", value: markdown });
        setLocaleForms((prev) => ({
          ...prev,
          [DEFAULT_LOCALE]: prev[DEFAULT_LOCALE]
            ? { ...prev[DEFAULT_LOCALE]!, content: markdown, dirty: true }
            : { title: page?.title ?? "", content: markdown, translationReady: true, dirty: true },
        }));
      } else {
        setLocaleForms((prev) => ({
          ...prev,
          [activeLocale]: prev[activeLocale]
            ? { ...prev[activeLocale]!, content: markdown, dirty: true }
            : undefined,
        }));
      }
    },
    [activeLocale, page?.title],
  );

  // The markdown editor value: for default locale use draftContent fallback
  // (legacy behaviour preserved); for non-default use the form state.
  const currentContent =
    activeLocale === DEFAULT_LOCALE
      ? (state.draftContent ?? localeForms[DEFAULT_LOCALE]?.content ?? page?.content ?? "")
      : (localeForms[activeLocale]?.content ?? "");

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = () => {
    if (!page) return;

    if (page.pageType === "segmented") {
      void segmentSaveRef.current?.();
      return;
    }

    if (activeLocale === DEFAULT_LOCALE) {
      // Default locale: use existing main-page mutation (content body only)
      if (currentContent === page.content) return;
      save.mutate(
        { slug, data: { content: currentContent } },
        {
          onSuccess: () => {
            dispatch({ type: "setSaved", value: true });
            dispatch({ type: "setDraftContent", value: null });
            setLocaleForms((prev) => ({
              ...prev,
              [DEFAULT_LOCALE]: prev[DEFAULT_LOCALE]
                ? { ...prev[DEFAULT_LOCALE]!, dirty: false }
                : undefined,
            }));
            showSaved();
          },
        },
      );
    } else {
      // Non-default locale: use translation endpoint
      const form = localeForms[activeLocale];
      if (!form) return;
      saveTranslation.mutate(
        {
          locale: activeLocale,
          body: {
            title: form.title,
            content: form.content,
            translationReady: form.translationReady,
          },
        },
        {
          onSuccess: () => {
            dispatch({ type: "setSaved", value: true });
            setLocaleForms((prev) => ({
              ...prev,
              [activeLocale]: prev[activeLocale]
                ? { ...prev[activeLocale]!, dirty: false }
                : undefined,
            }));
            showSaved();
          },
        },
      );
    }
  };

  useKeyboardSave(handleSave);

  useEffect(() => {
    if (!state.saved) return;
    const timer = setTimeout(() => dispatch({ type: "setSaved", value: false }), 2000);
    return () => clearTimeout(timer);
  }, [state.saved]);

  const changeFontSize = (delta: number) => {
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, state.sourceFontSize + delta));
    localStorage.setItem(FONT_SIZE_KEY, String(next));
    dispatch({ type: "setSourceFontSize", value: next });
  };

  async function handlePatch(data: {
    title?: string;
    slug?: string;
    status?: "draft" | "published" | "hidden";
    showTitle?: boolean;
    titleAlignment?: PageTitleAlignmentValue;
    displayMode?: PageDisplayMode;
    overlayWidth?: OverlayWidth;
  }) {
    dispatch({ type: "setPatchError", value: null });
    try {
      const updated = await patch.mutateAsync({ slug, data });
      showSaved();
      if (data.slug && data.slug !== slug) {
        navigate(`/pages/${updated.slug}`, { replace: true });
      }
    } catch (err) {
      dispatch({
        type: "setPatchError",
        value: err instanceof Error ? err.message : editorMessages.saveError,
      });
    }
  }

  function handleTitleSave() {
    void handlePatch({ title: state.editTitleValue });
    dispatch({ type: "setEditingTitle", value: false });
  }

  function handleSlugSave() {
    void handlePatch({ slug: state.editSlugValue });
    dispatch({ type: "setEditingSlug", value: false });
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
        dirty: localeForms[loc]?.dirty ?? false,
      },
    ]),
  ) as Record<Locale, { status: ContentPage["translationStatus"][Locale]; dirty: boolean }>;

  function handleCreateTranslation() {
    const defaultForm = localeForms[DEFAULT_LOCALE];
    setLocaleForms((prev) => ({
      ...prev,
      [activeLocale]: {
        title: defaultForm?.title ?? page?.title ?? "",
        content: defaultForm?.content ?? page?.content ?? "",
        translationReady: false,
        dirty: true,
      },
    }));
    // Sync draftContent to empty so MarkdownEditor re-renders with new value
    dispatch({ type: "setDraftContent", value: null });
  }

  function handleDeleteTranslation() {
    if (!window.confirm(`Delete ${activeLocale.toUpperCase()} translation?`)) return;
    deleteTranslation.mutate(activeLocale, {
      onSuccess: () => {
        setLocaleForms((prev) => ({ ...prev, [activeLocale]: undefined }));
        setActiveLocale(DEFAULT_LOCALE);
      },
    });
  }

  // When user switches tabs, sync the MarkdownEditor key/value correctly.
  // For the default locale the legacy draftContent path is used; for
  // non-default we reset draftContent so the editor renders the form value.
  function handleTabSelect(loc: Locale) {
    if (loc !== DEFAULT_LOCALE) {
      // Don't reset draftContent here — we let the editor receive the form
      // value via `currentContent` derived above.
      dispatch({ type: "setDraftContent", value: null });
    }
    setActiveLocale(loc);
  }

  const isSaving = save.isPending || saveTranslation.isPending;

  const title = page?.title ?? slug;

  const activeForm = localeForms[activeLocale];

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
          confirmDelete={state.confirmDelete}
          isDeleting={deletePage.isPending}
          isSaving={isSaving}
          saved={state.saved}
          common={common}
          editorMessages={editorMessages}
          onDecreaseFont={() => changeFontSize(-1)}
          onIncreaseFont={() => changeFontSize(+1)}
          onOpenDelete={() => dispatch({ type: "setConfirmDelete", value: true })}
          onCancelDelete={() => dispatch({ type: "setConfirmDelete", value: false })}
          onConfirmDelete={() => {
            deletePage.mutate(slug, {
              onSuccess: () => navigate("/pages"),
            });
          }}
          onSave={handleSave}
          onPreview={() => {
            const base =
              (import.meta.env.VITE_FRONTEND_URL as string | undefined) ??
              (import.meta.env.DEV ? "http://localhost:3000" : "https://musiccloud.io");
            window.open(`${base}/${slug}`, "_blank");
          }}
        />
      </PageHeader>

      {page && (
        <EditorMetadataBar
          page={page as unknown as ContentPage}
          patchError={state.patchError}
          editingTitle={state.editingTitle}
          editTitleValue={state.editTitleValue}
          editingSlug={state.editingSlug}
          editSlugValue={state.editSlugValue}
          editorMessages={editorMessages}
          locale={locale}
          common={common}
          onStartEditTitle={() => {
            dispatch({ type: "setEditTitleValue", value: page.title });
            dispatch({ type: "setEditingTitle", value: true });
          }}
          onTitleValueChange={(value) => dispatch({ type: "setEditTitleValue", value })}
          onSaveTitle={handleTitleSave}
          onCancelTitle={() => dispatch({ type: "setEditingTitle", value: false })}
          onStartEditSlug={() => {
            dispatch({ type: "setEditSlugValue", value: page.slug });
            dispatch({ type: "setEditingSlug", value: true });
          }}
          onSlugValueChange={(value) => dispatch({ type: "setEditSlugValue", value })}
          onSlugBlur={(value) => dispatch({ type: "setEditSlugValue", value: slugify(value) })}
          onSaveSlug={handleSlugSave}
          onCancelSlug={() => dispatch({ type: "setEditingSlug", value: false })}
          onStatusChange={(value) => void handlePatch({ status: value as "draft" | "published" | "hidden" })}
          onShowTitleChange={(value) => void handlePatch({ showTitle: value })}
          onTitleAlignmentChange={(value) => void handlePatch({ titleAlignment: value })}
        />
      )}

      {page && (
        <PageDisplaySettings
          displayMode={page.displayMode}
          overlayWidth={page.overlayWidth}
          onChange={(patch) => void handlePatch(patch)}
        />
      )}

      {page && page.pageType === "segmented" ? (
        <PageBody className="overflow-visible flex flex-col gap-3">
          {isLoading && (
            <div className="flex items-center justify-center h-64 text-[var(--ds-text-subtle)] text-sm">
              {editorMessages.loadingContent}
            </div>
          )}
          <SegmentManager page={page} onSaved={showSaved} saveRef={segmentSaveRef} />
          {save.isError && <p className="text-red-500 text-sm text-center mt-4">{editorMessages.saveError}</p>}
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
          {page && activeLocale !== DEFAULT_LOCALE && activeForm && (
            <div className="px-3 pt-3 flex items-center gap-3">
              <label className="text-xs font-medium text-[var(--ds-text-muted)] shrink-0">
                Title ({activeLocale.toUpperCase()}):
              </label>
              <input
                type="text"
                value={activeForm.title}
                onChange={(e) => {
                  const value = e.target.value;
                  setLocaleForms((prev) => ({
                    ...prev,
                    [activeLocale]: prev[activeLocale]
                      ? { ...prev[activeLocale]!, title: value, dirty: true }
                      : undefined,
                  }));
                }}
                className="flex-1 px-2 py-1 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--ds-text-muted)] cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={activeForm.translationReady}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocaleForms((prev) => ({
                      ...prev,
                      [activeLocale]: prev[activeLocale]
                        ? { ...prev[activeLocale]!, translationReady: checked, dirty: true }
                        : undefined,
                    }));
                  }}
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
            {page && activeLocale !== DEFAULT_LOCALE && !activeForm ? (
              /* No translation yet: offer to create one */
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <p className="text-sm text-[var(--ds-text-muted)]">
                  No {activeLocale.toUpperCase()} translation yet.
                </p>
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
            {(save.isError || saveTranslation.isError) && (
              <p className="text-red-500 text-sm text-center mt-4">{editorMessages.saveError}</p>
            )}
          </PageBody>
        </DashboardSection>
      )}
    </PageLayout>
  );
}

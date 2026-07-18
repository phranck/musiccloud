import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
  DashboardIconButton,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import type {
  ContentPage,
  Locale,
  PageTitleAlignment as PageTitleAlignmentValue,
  SingleContentContext,
} from "@musiccloud/shared";
import { ContentContext, DEFAULT_LOCALE, getLocalizedText, LOCALES } from "@musiccloud/shared";
import {
  EyeIcon,
  FileLockIcon,
  MarkdownLogoIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dialog, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { dashboardCopy } from "@/copy/dashboard";
import {
  SystemOwnedContentPageError,
  useAdminContentPage,
  useDeleteContentPage,
} from "@/features/content/hooks/useAdminContent";
import { useAdminNavigationConfiguration } from "@/features/content/hooks/useAdminNav";
import { buildLocalizedPageTitle, createPageTitleTranslationDraft } from "@/features/content/pageLocalization";
import { LanguageTabs } from "@/features/content/pages/LanguageTabs";
import { PagePublishingEditor } from "@/features/content/pages/PagePublishingEditor";
import { PageTitleAlignment } from "@/features/content/pages/PageTitleAlignment";
import { SegmentManager } from "@/features/content/pages/SegmentManager";
import { useDeleteTranslation } from "@/features/content/pages/usePageTranslations";
import { buildPublicationPreviews } from "@/features/content/publicationDrafts";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { isContentDirty } from "@/features/content/state/slices/contentSlice";
import type { MetaFields } from "@/features/content/state/slices/metaSlice";
import { isMetaFieldDirty } from "@/features/content/state/slices/metaSlice";
import { PublicationsActionType } from "@/features/content/state/slices/publicationsSlice";
import { isTranslationDirty } from "@/features/content/state/slices/translationsSlice";
import { formatEnglishDate } from "@/lib/format";
import { FormLabel } from "@/shared/ui/FormPrimitives";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

const FONT_SIZE_KEY = "content-editor-source-font-size";
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_DEFAULT = 13;
const FRONTEND_PREVIEW_BASE_URL = import.meta.env.DEV ? "http://localhost:3001" : "https://musiccloud.io";
const DEVELOPER_PREVIEW_BASE_URL = import.meta.env.DEV ? "http://localhost:3100" : "https://developer.musiccloud.io";

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

const EditorActionType = {
  ResetForSlug: "resetForSlug",
  SetSaved: "setSaved",
  SetConfirmDelete: "setConfirmDelete",
  SetSourceFontSize: "setSourceFontSize",
  SetEditingSlug: "setEditingSlug",
  SetEditSlugValue: "setEditSlugValue",
  SetPatchError: "setPatchError",
} as const;

const ContentMetaActionType = {
  Hydrate: "hydrate",
  SetField: "set-field",
} as const;

const ContentBodyActionType = {
  Hydrate: "hydrate",
  Set: "set",
} as const;

const ContentTranslationsActionType = {
  Hydrate: "hydrate",
  SetField: "set-field",
  AddLocale: "add-locale",
} as const;

const ContentSegmentsActionType = {
  HydrateOwner: "hydrate-owner",
} as const;

const TranslationStatus = {
  Missing: "missing",
} as const;

type EditorAction =
  | { type: typeof EditorActionType.ResetForSlug }
  | { type: typeof EditorActionType.SetSaved; value: boolean }
  | { type: typeof EditorActionType.SetConfirmDelete; value: boolean }
  | { type: typeof EditorActionType.SetSourceFontSize; value: number }
  | { type: typeof EditorActionType.SetEditingSlug; value: boolean }
  | { type: typeof EditorActionType.SetEditSlugValue; value: string }
  | { type: typeof EditorActionType.SetPatchError; value: string | null };

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
    case EditorActionType.ResetForSlug:
      return {
        ...state,
        saved: false,
        confirmDelete: false,
        editingSlug: false,
        patchError: null,
      };
    case EditorActionType.SetSaved:
      return { ...state, saved: action.value };
    case EditorActionType.SetConfirmDelete:
      return { ...state, confirmDelete: action.value };
    case EditorActionType.SetSourceFontSize:
      return { ...state, sourceFontSize: action.value };
    case EditorActionType.SetEditingSlug:
      return { ...state, editingSlug: action.value };
    case EditorActionType.SetEditSlugValue:
      return { ...state, editSlugValue: action.value };
    case EditorActionType.SetPatchError:
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
  };
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  onOpenDelete: () => void;
  previews: Array<{ context: SingleContentContext; label: string; url: string }>;
}

function EditorHeaderActions({
  sourceFontSize,
  canIncreaseFont,
  canDecreaseFont,
  editorMessages,
  onDecreaseFont,
  onIncreaseFont,
  onOpenDelete,
  previews,
}: EditorHeaderActionsProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 border border-[var(--ds-border)] rounded-control px-2 py-1.5 text-[var(--ds-text-muted)]">
        <span className="text-xs font-medium mr-1 select-none">Aa</span>
        <DashboardIconButton
          onClick={onDecreaseFont}
          disabled={!canDecreaseFont}
          className="size-5"
          size="action"
          title={editorMessages.decreaseFontSize}
          type="button"
          variant={DashboardButtonVariant.Ghost}
          aria-label={editorMessages.decreaseFontSize}
        >
          <MinusCircleIcon weight="duotone" className="size-3.5" />
        </DashboardIconButton>
        <span className="w-8 text-center text-xs tabular-nums select-none text-[var(--ds-text)]">
          {sourceFontSize}px
        </span>
        <DashboardIconButton
          onClick={onIncreaseFont}
          disabled={!canIncreaseFont}
          className="size-5"
          size="action"
          title={editorMessages.increaseFontSize}
          type="button"
          variant={DashboardButtonVariant.Ghost}
          aria-label={editorMessages.increaseFontSize}
        >
          <PlusCircleIcon weight="duotone" className="size-3.5" />
        </DashboardIconButton>
      </div>

      {previews.map((preview) => (
        <DashboardActionButton
          key={preview.context}
          action={DashboardActionId.Copy}
          icon={<EyeIcon weight="duotone" className="size-3.5" />}
          label={preview.label}
          onClick={() => window.open(preview.url, "_blank")}
          size="action"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
      ))}

      <DashboardActionButton
        action={DashboardActionId.Delete}
        icon={<TrashIcon weight="duotone" className="size-3.5" />}
        iconOnly
        label={editorMessages.deletePage}
        onClick={onOpenDelete}
        size="action"
        title={editorMessages.deletePage}
        type="button"
      />
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
  previews: EditorHeaderActionsProps["previews"];
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
  previews,
}: ContentEditorHeaderProps) {
  return (
    <PageHeader title={title} renderLeading={() => <HeaderBackButton label={backLabel} onClick={onBack} />}>
      <SaveNotification phase={savedPhase} label={savedLabel} />
      <EditorHeaderActions
        sourceFontSize={sourceFontSize}
        canIncreaseFont={sourceFontSize < FONT_SIZE_MAX}
        canDecreaseFont={sourceFontSize > FONT_SIZE_MIN}
        editorMessages={editorMessages}
        onDecreaseFont={onDecreaseFont}
        onIncreaseFont={onIncreaseFont}
        onOpenDelete={onOpenDelete}
        previews={previews}
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
    showTitleLabel: string;
    createdBy: string;
    updatedBy: string;
    updatedAt: string;
  };
  common: {
    cancel: string;
    ok: string;
  };
  onStartEditSlug: () => void;
  onSlugValueChange: (value: string) => void;
  onSlugBlur: (value: string) => void;
  onSaveSlug: () => void;
  onCancelSlug: () => void;
  onShowTitleChange: (value: boolean) => void;
  onTitleAlignmentChange: (value: PageTitleAlignmentValue) => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatEnglishDate(d, {
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
  common,
  onStartEditSlug,
  onSlugValueChange,
  onSlugBlur,
  onSaveSlug,
  onCancelSlug,
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
            <DashboardInput
              type="text"
              value={editSlugValue}
              onChange={(e) => onSlugValueChange(e.target.value)}
              onBlur={(e) => onSlugBlur(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveSlug();
              }}
              pattern="[a-z0-9-]+"
              className="w-40 font-mono text-xs"
            />
            <DashboardButton type="button" onClick={onSaveSlug} size="action" variant={DashboardButtonVariant.Primary}>
              {common.ok}
            </DashboardButton>
            <DashboardActionButton
              action={DashboardActionId.Cancel}
              icon={false}
              label={common.cancel}
              onClick={onCancelSlug}
              size="action"
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
          </div>
        ) : (
          <button type="button" onClick={onStartEditSlug} className="hover:underline font-mono text-[var(--ds-text)]">
            /{page.slug}
          </button>
        )}
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
              {editorMessages.updatedAt} <span className="text-[var(--ds-text)]">{formatDateTime(page.updatedAt)}</span>
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
  deletePending?: boolean;
  showDeleteTranslation?: boolean;
  onChange: (value: string) => void;
  onDeleteTranslation?: () => void;
}

function PageTitleLocalizationField({
  label,
  locale,
  value,
  fallback,
  placeholder,
  deletePending = false,
  showDeleteTranslation = false,
  onChange,
  onDeleteTranslation,
}: PageTitleLocalizationFieldProps) {
  const localeLabel = locale.toUpperCase();
  const inputId = `content-page-title-${locale}`;

  return (
    <div className="bg-[var(--ds-surface)] px-3 pt-2 pb-3">
      <div className="flex flex-col gap-1.5">
        <FormLabel htmlFor={inputId}>{label}</FormLabel>
        <div className="flex items-center gap-2">
          <DashboardInput
            id={inputId}
            type="text"
            aria-label={`${label} ${localeLabel}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={fallback || placeholder}
          />
          {showDeleteTranslation && onDeleteTranslation && (
            <DashboardActionButton
              action={DashboardActionId.Delete}
              disabled={deletePending}
              iconClassName="size-3"
              label="Delete translation"
              onClick={onDeleteTranslation}
              type="button"
            />
          )}
        </div>
      </div>
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
            <DashboardActionButton
              action={DashboardActionId.Create}
              label={`Create translation from ${DEFAULT_LOCALE.toUpperCase()}`}
              onClick={onCreateTranslation}
              size="control"
              type="button"
            />
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
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          disabled={pending}
          icon={false}
          label={common.cancel}
          onClick={onClose}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Delete}
          busyLabel="…"
          icon={false}
          label={common.delete}
          onClick={onDelete}
          status={pending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Editor hydration + locale tab helpers
// ---------------------------------------------------------------------------

/**
 * Hydrates the shared pages-editor slices (meta, content, translations and —
 * for segmented pages — segments) from a loaded page record. No-op while the
 * page query is still pending.
 *
 * @param page - The loaded content page, or undefined while the query is pending.
 * @param dispatch - The pages-editor dispatch bundle whose slices get hydrated.
 */
function hydrateEditorSlices(
  page: ContentPage | undefined,
  dispatch: ReturnType<typeof usePagesEditor>["dispatch"],
): void {
  if (!page) return;
  dispatch.meta({ type: ContentMetaActionType.Hydrate, entries: [{ slug: page.slug, meta: page }] });
  dispatch.content({
    type: ContentBodyActionType.Hydrate,
    entries: [{ slug: page.slug, content: page.content }],
  });
  dispatch.publications({
    type: PublicationsActionType.Hydrate,
    entries: [
      {
        slug: page.slug,
        pageId: page.id,
        contextMask: page.contextMask,
        publications: page.publications,
      },
    ],
  });
  dispatch.translations({
    type: ContentTranslationsActionType.Hydrate,
    entries: (page.translations ?? []).map((translation) => ({
      slug: page.slug,
      locale: translation.locale,
      title: translation.title,
      content: translation.content,
    })),
  });
  if (page.pageType === "segmented") {
    dispatch.segments({
      type: ContentSegmentsActionType.HydrateOwner,
      ownerSlug: page.slug,
      segments: page.segments.map((segment) => ({
        position: segment.position,
        label: segment.label,
        targetSlug: segment.targetSlug,
        translations: segment.translations,
      })),
    });
  }
}

/**
 * Re-hydrates the editor slices whenever the loaded page changes, so slice
 * readers reflect live edits with the server data as the base line.
 *
 * @param page - The loaded content page, or undefined while the query is pending.
 * @param editor - The pages-editor context whose slices get hydrated.
 */
function usePageEditorHydration(page: ContentPage | undefined, editor: ReturnType<typeof usePagesEditor>) {
  const { dispatch } = editor;
  useEffect(() => {
    hydrateEditorSlices(page, dispatch);
  }, [page, dispatch]);
}

/**
 * Derives the per-locale tab states (translation status + dirty flag) for the
 * language tabs from the loaded page and the live editor slices.
 *
 * @param page - The loaded content page, or undefined while pending.
 * @param editor - The pages-editor context providing the dirty state.
 * @returns One `{ status, dirty }` record per configured locale.
 */
function buildTabStates(page: ContentPage | undefined, editor: ReturnType<typeof usePagesEditor>) {
  const statuses = page?.translationStatus ?? ({} as ContentPage["translationStatus"]);

  return Object.fromEntries(
    LOCALES.map((loc) => [
      loc,
      {
        status: statuses[loc] ?? TranslationStatus.Missing,
        dirty: page
          ? loc === DEFAULT_LOCALE
            ? isMetaFieldDirty(editor.meta, page.slug, "title") || isContentDirty(editor.content, page.slug)
            : isTranslationDirty(editor.translations, page.slug, loc)
          : false,
      },
    ]),
  ) as Record<Locale, { status: ContentPage["translationStatus"][Locale]; dirty: boolean }>;
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
  const messages = dashboardCopy;
  const common = messages.common;
  const editorMessages = messages.content.editor;
  const pageMessages = messages.content.pages;
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: page, isLoading, isError: isPageError, error: pageError } = useAdminContentPage(slug);
  const { data: navigationConfiguration } = useAdminNavigationConfiguration();
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
    dispatch({ type: EditorActionType.ResetForSlug });
    setActiveLocale(DEFAULT_LOCALE);
  }, [slug]);

  usePageEditorHydration(page, editor);

  useEffect(() => {
    if (!page || !navigationConfiguration) return;
    let navigationContextMask = 0;
    for (const entry of navigationConfiguration.entries) {
      if (entry.pageId === page.id) navigationContextMask |= entry.contextMask;
    }
    editor.dispatch.publications({
      type: PublicationsActionType.SetNavigationDependencies,
      slug: page.slug,
      contextMask: navigationContextMask,
    });
  }, [editor.dispatch, navigationConfiguration, page]);

  // ---------------------------------------------------------------------------
  // Slice readers — reflect live edits, fall back to server data on first paint.
  // ---------------------------------------------------------------------------

  const metaCurrent = page ? (editor.meta.pages[page.slug]?.current ?? page) : null;
  const contentCurrent = page ? (editor.content.pages[page.slug]?.current ?? page.content) : "";
  const translationCurrent = (loc: Locale) =>
    page ? editor.translations.byPage[page.slug]?.[loc]?.current : undefined;
  const publicationPage = page ? editor.publications.pages[page.slug] : undefined;
  const publicationCurrent =
    publicationPage?.current ?? (page ? { contextMask: page.contextMask, publications: page.publications } : null);

  const setMeta = useCallback(
    <K extends keyof MetaFields>(field: K, value: MetaFields[K]) => {
      if (!page) return;
      editor.dispatch.meta({ type: ContentMetaActionType.SetField, slug: page.slug, field, value });
    },
    [page, editor.dispatch],
  );

  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      if (!page) return;
      if (activeLocale === DEFAULT_LOCALE) {
        editor.dispatch.content({ type: ContentBodyActionType.Set, slug: page.slug, value: markdown });
      } else {
        editor.dispatch.translations({
          type: ContentTranslationsActionType.SetField,
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
    dispatch({ type: EditorActionType.SetSourceFontSize, value: next });
  };

  function handleTitleChange(value: string) {
    if (!page) return;
    if (activeLocale === DEFAULT_LOCALE) {
      setMeta("title", value);
    } else if (translationCurrent(activeLocale) !== undefined) {
      editor.dispatch.translations({
        type: ContentTranslationsActionType.SetField,
        slug: page.slug,
        locale: activeLocale,
        field: "title",
        value,
      });
    } else {
      editor.dispatch.translations({
        type: ContentTranslationsActionType.AddLocale,
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
    dispatch({ type: EditorActionType.SetEditingSlug, value: false });
    // Note: the URL still reflects the old slug until the bulk save persists
    // the rename and triggers a refetch. URL redirect after save lives in a
    // later task (see plan T22 drift-note about useGlobalPagesSave).
  }

  // ---------------------------------------------------------------------------
  // Locale tab helpers
  // ---------------------------------------------------------------------------

  const tabStates = buildTabStates(page, editor);

  function handleCreateTranslation() {
    if (!page) return;
    editor.dispatch.translations({
      type: ContentTranslationsActionType.AddLocale,
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

  const previews = buildPublicationPreviews(
    publicationCurrent?.publications ?? [],
    {
      [ContentContext.Frontend]: `${pageMessages.contexts.frontend} ${editorMessages.preview}`,
      [ContentContext.DeveloperPortal]: `${pageMessages.contexts.developerPortal} ${editorMessages.preview}`,
    },
    {
      [ContentContext.Frontend]: FRONTEND_PREVIEW_BASE_URL,
      [ContentContext.DeveloperPortal]: DEVELOPER_PREVIEW_BASE_URL,
    },
  );

  if (isPageError) {
    const systemOwned = pageError instanceof SystemOwnedContentPageError;
    return (
      <PageLayout>
        <PageHeader
          title={pageMessages.title}
          renderLeading={() => <HeaderBackButton label={pageMessages.title} onClick={() => navigate("/pages")} />}
        />
        <PageBody>
          <ContentUnavailableView
            icon={<FileLockIcon weight="duotone" aria-hidden />}
            title={systemOwned ? pageMessages.docsReserved : common.unknownError}
            subtitle={pageError instanceof Error ? pageError.message : undefined}
          />
        </PageBody>
      </PageLayout>
    );
  }

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
        onOpenDelete={() => dispatch({ type: EditorActionType.SetConfirmDelete, value: true })}
        previews={previews}
      />

      {page && metaCurrent && (
        <EditorMetadataBar
          page={{ ...page, ...metaCurrent } as ContentPage}
          patchError={state.patchError}
          editingSlug={state.editingSlug}
          editSlugValue={state.editSlugValue}
          editorMessages={editorMessages}
          common={common}
          onStartEditSlug={() => {
            dispatch({ type: EditorActionType.SetEditSlugValue, value: metaCurrent.slug });
            dispatch({ type: EditorActionType.SetEditingSlug, value: true });
          }}
          onSlugValueChange={(value) => dispatch({ type: EditorActionType.SetEditSlugValue, value })}
          onSlugBlur={(value) => dispatch({ type: EditorActionType.SetEditSlugValue, value: slugify(value) })}
          onSaveSlug={handleSlugSave}
          onCancelSlug={() => dispatch({ type: EditorActionType.SetEditingSlug, value: false })}
          onShowTitleChange={(value) => setMeta("showTitle", value)}
          onTitleAlignmentChange={(value) => setMeta("titleAlignment", value)}
        />
      )}

      {page && metaCurrent && <PagePublishingEditor page={page} meta={metaCurrent} onMetaChange={setMeta} />}

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
          deletePending={deleteTranslation.isPending}
          showDeleteTranslation={activeLocale !== DEFAULT_LOCALE && activeTranslation !== undefined}
          onChange={handleTitleChange}
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
        onClose={() => dispatch({ type: EditorActionType.SetConfirmDelete, value: false })}
        onDelete={() => {
          deletePage.mutate(slug, { onSuccess: () => navigate("/pages") });
        }}
      />
    </PageLayout>
  );
}

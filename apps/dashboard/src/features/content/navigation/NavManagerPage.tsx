import { arrayMove } from "@dnd-kit/sortable";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardInput,
  SaveActionButton,
} from "@musiccloud/dashboard-ui";
import {
  ContentContext,
  type ContentContextMask,
  type ContentPageSummary,
  DEFAULT_LOCALE,
  expectedNavigationPlacements,
  hasAllContextBits,
  isSafeConfiguredUrl,
  KNOWN_CONTENT_CONTEXT_MASK,
  LOCALES,
  type Locale,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationArea,
  type NavigationAreaMask,
  type NavigationConfiguration,
  type NavigationConfigurationInput,
  type NavigationEntry,
  type NavigationPlacement,
  NavigationTargetKind,
  NavTarget,
} from "@musiccloud/shared";
import {
  BrowsersIcon,
  CaretDownIcon,
  CaretUpIcon,
  FileMdIcon,
  LinkIcon,
  LockKeyIcon,
  PlusCircleIcon,
  SquareHalfBottomIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useReducer, useRef } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown } from "@/components/ui/Dropdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { SegmentSwitch } from "@/components/ui/SegmentSwitch";
import { dashboardCopy } from "@/copy/dashboard";
import { useContentPages } from "@/features/content/hooks/useAdminContent";
import { useAdminNavigationConfiguration, useSaveNavigationConfiguration } from "@/features/content/hooks/useAdminNav";
import { NavigationMaskControl } from "@/features/content/navigation/NavigationMaskControl";
import {
  NavigationPlacementList,
  NavigationPlacementListItem,
} from "@/features/content/navigation/NavigationPlacementList";
import { NavigationMaskKind } from "@/features/content/navigation/navigation.constants";
import type { ApiRequestError } from "@/shared/utils/api-error";

const NAV_TEXT = dashboardCopy.content.navigation;

type NavText = typeof NAV_TEXT;

const NavigationAddType = {
  Page: "page",
  Url: "url",
} as const;

type NavigationAddType = (typeof NavigationAddType)[keyof typeof NavigationAddType];

const PlacementViewIcon = {
  Main: "main",
  Footer: "footer",
} as const;

interface SaveError {
  message: string;
  errorId: string | null;
}

interface PlacementView {
  title: "Frontend Main" | "Frontend Footer" | "Developer Portal Main" | "Developer Portal Footer";
  context: typeof ContentContext.Frontend | typeof ContentContext.DeveloperPortal;
  area: typeof NavigationArea.Main | typeof NavigationArea.Footer;
  icon: (typeof PlacementViewIcon)[keyof typeof PlacementViewIcon];
}

const PLACEMENT_VIEWS: readonly PlacementView[] = [
  {
    title: "Frontend Main",
    context: ContentContext.Frontend,
    area: NavigationArea.Main,
    icon: PlacementViewIcon.Main,
  },
  {
    title: "Frontend Footer",
    context: ContentContext.Frontend,
    area: NavigationArea.Footer,
    icon: PlacementViewIcon.Footer,
  },
  {
    title: "Developer Portal Main",
    context: ContentContext.DeveloperPortal,
    area: NavigationArea.Main,
    icon: PlacementViewIcon.Main,
  },
  {
    title: "Developer Portal Footer",
    context: ContentContext.DeveloperPortal,
    area: NavigationArea.Footer,
    icon: PlacementViewIcon.Footer,
  },
] as const;

const NON_DEFAULT_LOCALES = LOCALES.filter((locale): locale is Locale => locale !== DEFAULT_LOCALE);
const LOCALE_FLAG: Record<string, string> = { de: "🇩🇪" };
const NEW_NAVIGATION_URL_ERROR_ID = "navigation-new-url-error";

function cloneEntries(configuration: NavigationConfiguration): NavigationEntry[] {
  return configuration.entries.map((entry) => ({
    ...entry,
    placements: entry.placements.map((placement) => ({ ...placement })),
    translations: { ...entry.translations },
  }));
}

function placementFor(entry: NavigationEntry, context: PlacementView["context"], area: PlacementView["area"]) {
  return entry.placements.find((placement) => placement.context === context && placement.area === area);
}

function entriesForPlacement(
  entries: NavigationEntry[],
  context: PlacementView["context"],
  area: PlacementView["area"],
) {
  return entries
    .filter((entry) => placementFor(entry, context, area))
    .sort((left, right) => placementFor(left, context, area)!.position - placementFor(right, context, area)!.position);
}

function entryLabel(entry: NavigationEntry): string {
  return entry.label || entry.pageTitle || entry.url || entry.systemKey || `Navigation item ${entry.id}`;
}

function nextPlacementPosition(
  entries: NavigationEntry[],
  context: NavigationPlacement["context"],
  area: NavigationPlacement["area"],
): number {
  return (
    entries.reduce((maximum, entry) => {
      const placement = entry.placements.find((candidate) => candidate.context === context && candidate.area === area);
      return placement ? Math.max(maximum, placement.position) : maximum;
    }, -1) + 1
  );
}

function placementsForNewEntry(
  entries: NavigationEntry[],
  contextMask: ContentContextMask,
  areaMask: NavigationAreaMask,
): NavigationPlacement[] {
  return expectedNavigationPlacements(contextMask, areaMask).map(({ context, area }) => ({
    context,
    area,
    position: nextPlacementPosition(entries, context, area),
  }));
}

function reconcileEntryMasks(
  entries: NavigationEntry[],
  entryId: number,
  contextMask: ContentContextMask,
  areaMask: NavigationAreaMask,
): NavigationEntry[] {
  const current = entries.find((entry) => entry.id === entryId);
  if (!current) return entries;

  const existing = new Map(
    current.placements.map((placement) => [`${placement.context}:${placement.area}`, placement] as const),
  );
  const placements = expectedNavigationPlacements(contextMask, areaMask).map(({ context, area }) => {
    const retained = existing.get(`${context}:${area}`);
    return retained ? { ...retained } : { context, area, position: nextPlacementPosition(entries, context, area) };
  });

  return entries.map((entry) => (entry.id === entryId ? { ...entry, contextMask, areaMask, placements } : entry));
}

export function moveNavigationPlacement(
  entries: NavigationEntry[],
  context: PlacementView["context"],
  area: PlacementView["area"],
  activeId: number,
  overId: number,
): NavigationEntry[] {
  const ordered = entriesForPlacement(entries, context, area);
  const oldIndex = ordered.findIndex((entry) => entry.id === activeId);
  const newIndex = ordered.findIndex((entry) => entry.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return entries;

  const positions = new Map(arrayMove(ordered, oldIndex, newIndex).map((entry, position) => [entry.id, position]));
  return entries.map((entry) => ({
    ...entry,
    placements: entry.placements.map((placement) =>
      placement.context === context && placement.area === area && positions.has(entry.id)
        ? { ...placement, position: positions.get(entry.id)! }
        : placement,
    ),
  }));
}

function toConfigurationInput(entries: NavigationEntry[]): NavigationConfigurationInput {
  return {
    entries: entries.map((entry) => ({
      targetKind: entry.targetKind,
      pageId: entry.pageId,
      url: entry.url,
      systemKey: entry.systemKey,
      target: entry.target,
      label: entry.label,
      contextMask: entry.contextMask,
      areaMask: entry.areaMask,
      placements: entry.placements.map((placement) => ({ ...placement })),
      ...(Object.keys(entry.translations ?? {}).length > 0 ? { translations: { ...entry.translations } } : {}),
    })),
  };
}

function isSystemOwnedDocsUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate.startsWith("/")) return false;
  if (/%(?:2f|5c)/i.test(candidate) || candidate.includes("\\")) {
    return candidate.toLowerCase().startsWith("/docs");
  }

  try {
    const path = new URL(candidate, "https://navigation.invalid").pathname;
    const normalized = `/${decodeURIComponent(path).split("/").filter(Boolean).join("/")}`;
    return normalized === "/docs" || normalized.startsWith("/docs/");
  } catch {
    return candidate.toLowerCase().startsWith("/docs");
  }
}

function errorDetails(error: unknown, fallback: string): SaveError {
  if (!(error instanceof Error)) return { message: fallback, errorId: null };
  const requestError = error as ApiRequestError;
  return { message: error.message || fallback, errorId: requestError.errorId ?? null };
}

function NavigationErrorAlert({ error }: { error: SaveError }) {
  return (
    <div
      className="mb-[var(--ds-space-sm)] rounded-control border border-[var(--ds-danger-border)] bg-[var(--ds-danger-bg)] px-[var(--ds-space-sm)] py-[var(--ds-space-xs)] text-sm text-[var(--ds-danger-text)]"
      role="alert"
    >
      <p>{error.message}</p>
      {error.errorId && <code className="mt-[var(--ds-space-xs)] block text-xs">{error.errorId}</code>}
    </div>
  );
}

interface NavigationEntryEditorProps {
  area: PlacementView["area"];
  context: PlacementView["context"];
  entry: NavigationEntry;
  pages: ContentPageSummary[];
  text: NavText;
  expanded: boolean;
  onAreaMaskChange: (entryId: number, areaMask: NavigationAreaMask) => void;
  onContextMaskChange: (entryId: number, contextMask: ContentContextMask) => void;
  onLabelChange: (entryId: number, label: string) => void;
  onRemove: (entryId: number) => void;
  onToggleExpanded: (entryId: number) => void;
  onTranslationChange: (entryId: number, locale: Locale, value: string) => void;
}

function NavigationEntryEditor({
  area,
  context,
  entry,
  pages,
  text,
  expanded,
  onAreaMaskChange,
  onContextMaskChange,
  onLabelChange,
  onRemove,
  onToggleExpanded,
  onTranslationChange,
}: NavigationEntryEditorProps) {
  const systemTarget = entry.systemKey ? NAVIGATION_SYSTEM_TARGETS[entry.systemKey] : null;
  const page = entry.pageId ? pages.find((candidate) => candidate.id === entry.pageId) : null;
  const pagePath = page?.publications.find((publication) => publication.context === context)?.path;
  const displayTarget =
    systemTarget?.canonicalRoute ?? pagePath ?? entry.url ?? (entry.pageSlug ? `/${entry.pageSlug}` : "");
  const incompatibleContextMask =
    entry.targetKind === NavigationTargetKind.Page && page ? KNOWN_CONTENT_CONTEXT_MASK & ~page.contextMask : 0;
  const systemOwned = entry.targetKind === NavigationTargetKind.System;
  const translationPlaceholder = entry.pageTitle ?? entry.label ?? entry.url ?? entry.systemKey ?? "";
  const translationsId = `navigation-entry-${entry.id}-${context}-${area}-translations`;

  return (
    <div className="min-w-0 space-y-[var(--ds-space-sm)]">
      <div className="grid grid-cols-1 items-start gap-[var(--ds-space-sm)] xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
        <div className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-[var(--ds-space-xs)]">
            {systemOwned ? (
              <span className="inline-flex items-center gap-[var(--ds-space-xs)] rounded-control bg-[var(--ds-surface-hover)] p-[var(--ds-space-xs)] text-xs font-medium text-[var(--ds-text-muted)]">
                <LockKeyIcon className="size-3.5" weight="duotone" />
                {text.systemTarget}
              </span>
            ) : entry.targetKind === NavigationTargetKind.Page ? (
              <FileMdIcon className="size-4 shrink-0 text-[var(--ds-text-muted)]" weight="duotone" />
            ) : (
              <LinkIcon className="size-4 shrink-0 text-[var(--ds-text-muted)]" weight="duotone" />
            )}
            <span className="truncate text-sm font-medium text-[var(--ds-text)]">
              {entry.pageTitle ?? entry.url ?? entry.systemKey}
            </span>
          </div>
          <div className="mt-[var(--ds-space-xs)] truncate font-mono text-xs text-[var(--ds-text-muted)]">
            {displayTarget}
          </div>
        </div>

        <DashboardInput
          type="text"
          name={`navigation-entry-${entry.id}-label`}
          value={entry.label ?? ""}
          onChange={(event) => onLabelChange(entry.id, event.target.value)}
          placeholder={entry.pageTitle ?? entry.url ?? entry.systemKey ?? ""}
          className="min-w-0 text-xs"
          title={text.labelOverrideTitle}
        />

        {!systemOwned && (
          <DashboardActionButton
            action={DashboardActionId.Remove}
            icon={<XCircleIcon weight="duotone" className="size-3.5" />}
            iconOnly
            label={text.remove}
            onClick={() => onRemove(entry.id)}
            size="action"
            title={text.remove}
            type="button"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-[var(--ds-space-sm)] xl:grid-cols-2">
        <div className="space-y-[var(--ds-space-xs)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]">
            {text.context}
          </div>
          <NavigationMaskControl
            aria-label={`${entryLabel(entry)}: ${text.context}`}
            disabledMask={systemOwned ? KNOWN_CONTENT_CONTEXT_MASK : incompatibleContextMask}
            kind={NavigationMaskKind.Context}
            value={entry.contextMask}
            onChange={(value) => onContextMaskChange(entry.id, value)}
          />
        </div>
        <div className="space-y-[var(--ds-space-xs)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]">{text.area}</div>
          <NavigationMaskControl
            aria-label={`${entryLabel(entry)}: ${text.area}`}
            kind={NavigationMaskKind.Area}
            value={entry.areaMask}
            onChange={(value) => onAreaMaskChange(entry.id, value)}
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          aria-controls={translationsId}
          aria-expanded={expanded}
          onClick={() => onToggleExpanded(entry.id)}
          className="flex items-center gap-[var(--ds-space-xs)] text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
        >
          {expanded ? <CaretUpIcon className="size-3" /> : <CaretDownIcon className="size-3" />}
          <span className="font-medium uppercase tracking-wide">{text.translations}</span>
        </button>
        {expanded && (
          <div id={translationsId} className="mt-[var(--ds-space-xs)] flex flex-col gap-[var(--ds-space-xs)]">
            {NON_DEFAULT_LOCALES.map((locale) => (
              <div key={locale} className="flex items-center gap-[var(--ds-space-xs)]">
                <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[var(--ds-text-subtle)]">
                  {LOCALE_FLAG[locale] ?? ""} {locale.toUpperCase()}
                </span>
                <DashboardInput
                  type="text"
                  name={`navigation-entry-${entry.id}-translation-${locale}`}
                  value={entry.translations?.[locale] ?? ""}
                  placeholder={translationPlaceholder}
                  onChange={(event) => onTranslationChange(entry.id, locale, event.target.value)}
                  className="flex-1 text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AddNavigationItemProps {
  entries: NavigationEntry[];
  nextId: () => number;
  onAdd: (entry: NavigationEntry) => void;
  pages: ContentPageSummary[];
  text: NavText;
}

interface AddNavigationItemState {
  type: NavigationAddType;
  contextMask: ContentContextMask;
  areaMask: NavigationAreaMask;
  pageId: string;
  url: string;
  label: string;
}

const INITIAL_ADD_ITEM_STATE: AddNavigationItemState = {
  type: NavigationAddType.Page,
  contextMask: ContentContext.Frontend,
  areaMask: NavigationArea.Main,
  pageId: "",
  url: "",
  label: "",
};

function addNavigationItemReducer(
  state: AddNavigationItemState,
  action: Partial<AddNavigationItemState>,
): AddNavigationItemState {
  return { ...state, ...action };
}

function AddNavigationItem({ entries, nextId, onAdd, pages, text }: AddNavigationItemProps) {
  const [state, dispatch] = useReducer(addNavigationItemReducer, INITIAL_ADD_ITEM_STATE);
  const { type, contextMask, areaMask, pageId, url, label } = state;

  const compatiblePages = pages.filter((page) => hasAllContextBits(page.contextMask, contextMask));
  const trimmedUrl = url.trim();
  const docsOwned = type === NavigationAddType.Url && isSystemOwnedDocsUrl(trimmedUrl);
  const invalidUrl =
    type === NavigationAddType.Url &&
    trimmedUrl.length > 0 &&
    !docsOwned &&
    !isSafeConfiguredUrl(trimmedUrl, { allowRelative: true, allowMailto: true });
  const canAdd =
    type === NavigationAddType.Page ? pageId.length > 0 : trimmedUrl.length > 0 && !docsOwned && !invalidUrl;

  function handleContextMaskChange(value: ContentContextMask) {
    const selectedPage = pages.find((page) => page.id === pageId);
    dispatch({
      contextMask: value,
      ...(selectedPage && !hasAllContextBits(selectedPage.contextMask, value) ? { pageId: "" } : {}),
    });
  }

  function reset() {
    dispatch({ pageId: "", url: "", label: "" });
  }

  function handleAdd() {
    if (!canAdd) return;
    const placements = placementsForNewEntry(entries, contextMask, areaMask);
    if (type === NavigationAddType.Page) {
      const page = compatiblePages.find((candidate) => candidate.id === pageId);
      if (!page) return;
      onAdd({
        id: nextId(),
        targetKind: NavigationTargetKind.Page,
        pageId: page.id,
        pageSlug: page.slug,
        pageTitle: page.title,
        url: null,
        systemKey: null,
        target: NavTarget.Self,
        label: label.trim() || null,
        contextMask,
        areaMask,
        placements,
        translations: {},
        canonicalRoute: null,
        behavior: null,
      });
    } else {
      onAdd({
        id: nextId(),
        targetKind: NavigationTargetKind.Url,
        pageId: null,
        pageSlug: null,
        pageTitle: null,
        url: trimmedUrl,
        systemKey: null,
        target: NavTarget.Self,
        label: label.trim() || null,
        contextMask,
        areaMask,
        placements,
        translations: {},
        canonicalRoute: null,
        behavior: null,
      });
    }
    reset();
  }

  return (
    <fieldset className="m-0 space-y-[var(--ds-space-sm)] border-0 p-0" aria-label={text.addItem}>
      <SegmentSwitch
        aria-label={text.itemType}
        value={type}
        onChange={(value) => dispatch({ type: value })}
        options={[
          { value: NavigationAddType.Page, label: text.typePage },
          { value: NavigationAddType.Url, label: text.typeUrl },
        ]}
        size="sm"
      />

      <div className="grid grid-cols-1 gap-[var(--ds-space-sm)] md:grid-cols-2">
        <div className="space-y-[var(--ds-space-xs)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]">
            {text.context}
          </div>
          <NavigationMaskControl
            aria-label={`${text.addItem}: ${text.context}`}
            kind={NavigationMaskKind.Context}
            value={contextMask}
            onChange={handleContextMaskChange}
          />
        </div>
        <div className="space-y-[var(--ds-space-xs)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-subtle)]">{text.area}</div>
          <NavigationMaskControl
            aria-label={`${text.addItem}: ${text.area}`}
            kind={NavigationMaskKind.Area}
            value={areaMask}
            onChange={(value) => dispatch({ areaMask: value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-[var(--ds-space-xs)] md:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto]">
        {type === NavigationAddType.Page ? (
          <Dropdown
            aria-label={text.pageTarget}
            value={pageId}
            onChange={(value) => dispatch({ pageId: value })}
            options={compatiblePages.map((page) => ({ value: page.id, label: page.title }))}
            placeholder={text.choosePage}
            size="sm"
          />
        ) : (
          <div>
            <DashboardInput
              type="text"
              name="navigation-new-url"
              aria-describedby={docsOwned || invalidUrl ? NEW_NAVIGATION_URL_ERROR_ID : undefined}
              aria-invalid={docsOwned || invalidUrl || undefined}
              value={url}
              onChange={(event) => dispatch({ url: event.target.value })}
              placeholder={text.urlPlaceholder}
              className="w-full min-w-0 font-mono text-xs"
            />
            {docsOwned && (
              <p
                id={NEW_NAVIGATION_URL_ERROR_ID}
                className="mt-[var(--ds-space-xs)] text-xs text-[var(--ds-danger-text)]"
              >
                {text.docsOwned}
              </p>
            )}
            {invalidUrl && (
              <p
                id={NEW_NAVIGATION_URL_ERROR_ID}
                className="mt-[var(--ds-space-xs)] text-xs text-[var(--ds-danger-text)]"
              >
                {text.invalidUrl}
              </p>
            )}
          </div>
        )}
        <DashboardInput
          type="text"
          name="navigation-new-label"
          value={label}
          onChange={(event) => dispatch({ label: event.target.value })}
          placeholder={text.labelPlaceholder}
          className="min-w-0 text-xs"
        />
        <DashboardActionButton
          action={DashboardActionId.Create}
          disabled={!canAdd}
          icon={<PlusCircleIcon weight="duotone" className="size-4" />}
          iconOnly
          label={text.add}
          onClick={handleAdd}
          size="action"
          title={text.add}
          type="button"
        />
      </div>
    </fieldset>
  );
}

interface NavigationEditorState {
  sourceConfiguration: NavigationConfiguration;
  entries: NavigationEntry[];
  revision: number;
  dirty: boolean;
  isSaving: boolean;
  saveError: SaveError | null;
  expandedRows: Record<number, boolean>;
}

const NavigationEditorActionType = {
  Update: "update",
  SaveStarted: "save-started",
  SaveSucceeded: "save-succeeded",
  SaveFailed: "save-failed",
  SyncConfiguration: "sync-configuration",
  ToggleExpanded: "toggle-expanded",
} as const;

type NavigationEditorAction =
  | {
      type: typeof NavigationEditorActionType.Update;
      updater: (entries: NavigationEntry[]) => NavigationEntry[];
    }
  | { type: typeof NavigationEditorActionType.SaveStarted }
  | {
      type: typeof NavigationEditorActionType.SaveSucceeded;
      configuration: NavigationConfiguration;
      savedRevision: number;
    }
  | { type: typeof NavigationEditorActionType.SaveFailed; error: SaveError }
  | { type: typeof NavigationEditorActionType.SyncConfiguration; configuration: NavigationConfiguration }
  | { type: typeof NavigationEditorActionType.ToggleExpanded; entryId: number };

function createNavigationEditorState(configuration: NavigationConfiguration): NavigationEditorState {
  return {
    sourceConfiguration: configuration,
    entries: cloneEntries(configuration),
    revision: 0,
    dirty: false,
    isSaving: false,
    saveError: null,
    expandedRows: {},
  };
}

function navigationEditorReducer(state: NavigationEditorState, action: NavigationEditorAction): NavigationEditorState {
  switch (action.type) {
    case NavigationEditorActionType.Update:
      return {
        ...state,
        entries: action.updater(state.entries),
        revision: state.revision + 1,
        dirty: true,
        saveError: null,
      };
    case NavigationEditorActionType.SaveStarted:
      return { ...state, isSaving: true, saveError: null };
    case NavigationEditorActionType.SaveSucceeded:
      if (state.revision !== action.savedRevision) {
        return {
          ...state,
          sourceConfiguration: action.configuration,
          isSaving: false,
          saveError: null,
        };
      }
      return {
        ...state,
        sourceConfiguration: action.configuration,
        entries: cloneEntries(action.configuration),
        dirty: false,
        isSaving: false,
        saveError: null,
      };
    case NavigationEditorActionType.SaveFailed:
      return { ...state, isSaving: false, saveError: action.error };
    case NavigationEditorActionType.SyncConfiguration:
      if (state.sourceConfiguration === action.configuration) return state;
      // A local dirty draft wins over background refetches. Advancing only
      // the observed source keeps later clean refetches from replacing it.
      return state.dirty
        ? { ...state, sourceConfiguration: action.configuration }
        : {
            ...state,
            sourceConfiguration: action.configuration,
            entries: cloneEntries(action.configuration),
            saveError: null,
          };
    case NavigationEditorActionType.ToggleExpanded:
      return {
        ...state,
        expandedRows: { ...state.expandedRows, [action.entryId]: !state.expandedRows[action.entryId] },
      };
  }
}

interface NavigationEditorProps {
  common: { save: string; saved: string; saving: string };
  initialConfiguration: NavigationConfiguration;
  pages: ContentPageSummary[];
  text: NavText;
}

function NavigationEditor({ common, initialConfiguration, pages, text }: NavigationEditorProps) {
  const saveConfiguration = useSaveNavigationConfiguration();
  const [state, dispatch] = useReducer(navigationEditorReducer, initialConfiguration, createNavigationEditorState);
  const { entries, dirty, isSaving, saveError, expandedRows, sourceConfiguration } = state;
  const draftRevision = useRef(0);
  const temporaryId = useRef(-1);
  const { phase: savedPhase, show: showSaved } = useSaveNotification();

  if (sourceConfiguration !== initialConfiguration) {
    dispatch({ type: NavigationEditorActionType.SyncConfiguration, configuration: initialConfiguration });
  }

  const updateEntries = useCallback((updater: (current: NavigationEntry[]) => NavigationEntry[]) => {
    draftRevision.current += 1;
    dispatch({ type: NavigationEditorActionType.Update, updater });
  }, []);

  function handleContextMaskChange(entryId: number, contextMask: ContentContextMask) {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry || entry.targetKind === NavigationTargetKind.System) return;
    const page = entry.pageId ? pages.find((candidate) => candidate.id === entry.pageId) : null;
    if (page && !hasAllContextBits(page.contextMask, contextMask)) return;
    updateEntries((current) => reconcileEntryMasks(current, entryId, contextMask, entry.areaMask));
  }

  function handleAreaMaskChange(entryId: number, areaMask: NavigationAreaMask) {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    updateEntries((current) => reconcileEntryMasks(current, entryId, entry.contextMask, areaMask));
  }

  function handleLabelChange(entryId: number, label: string) {
    updateEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, label: label || null } : entry)),
    );
  }

  function handleTranslationChange(entryId: number, locale: Locale, value: string) {
    updateEntries((current) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const translations = { ...entry.translations };
        if (value.trim()) translations[locale] = value;
        else delete translations[locale];
        return { ...entry, translations };
      }),
    );
  }

  function handleRemove(entryId: number) {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry || entry.targetKind === NavigationTargetKind.System) return;
    updateEntries((current) => current.filter((candidate) => candidate.id !== entryId));
  }

  function handleMove(
    context: PlacementView["context"],
    area: PlacementView["area"],
    activeId: number,
    overId: number,
  ) {
    updateEntries((current) => moveNavigationPlacement(current, context, area, activeId, overId));
  }

  async function handleSave() {
    if (!dirty || isSaving) return;
    const savedRevision = draftRevision.current;
    dispatch({ type: NavigationEditorActionType.SaveStarted });
    try {
      const saved = await saveConfiguration.mutateAsync(toConfigurationInput(entries));
      dispatch({ type: NavigationEditorActionType.SaveSucceeded, configuration: saved, savedRevision });
      if (draftRevision.current === savedRevision) showSaved();
    } catch (error) {
      dispatch({ type: NavigationEditorActionType.SaveFailed, error: errorDetails(error, text.errorSaving) });
    }
  }

  return (
    <>
      <PageHeader title={text.pageTitle}>
        <SaveNotification phase={savedPhase} label={common.saved} />
        <SaveActionButton
          onClick={handleSave}
          disabled={!dirty || isSaving}
          busyLabel={common.saving}
          label={common.save}
          status={isSaving ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
        />
      </PageHeader>

      {saveError && <NavigationErrorAlert error={saveError} />}

      <div className="flex flex-col gap-[var(--ds-space-sm)]">
        <div className="grid grid-cols-1 gap-[var(--ds-space-sm)] xl:grid-cols-2">
          {PLACEMENT_VIEWS.map((view) => {
            const placementEntries = entriesForPlacement(entries, view.context, view.area);
            const Icon = view.icon === PlacementViewIcon.Main ? BrowsersIcon : SquareHalfBottomIcon;
            return (
              <DashboardSection key={view.title}>
                <DashboardSection.Header icon={<Icon weight="duotone" className="size-4" />} title={view.title} />
                <DashboardSection.Body>
                  <NavigationPlacementList
                    title={view.title}
                    emptyLabel={text.noEntries}
                    itemIds={placementEntries.map((entry) => entry.id)}
                    onMove={(activeId, overId) => handleMove(view.context, view.area, activeId, overId)}
                  >
                    {placementEntries.map((entry) => (
                      <NavigationPlacementListItem
                        key={entry.id}
                        dragLabel={text.dragTitle}
                        id={entry.id}
                        label={entryLabel(entry)}
                      >
                        <NavigationEntryEditor
                          area={view.area}
                          context={view.context}
                          entry={entry}
                          pages={pages}
                          text={text}
                          expanded={!!expandedRows[entry.id]}
                          onAreaMaskChange={handleAreaMaskChange}
                          onContextMaskChange={handleContextMaskChange}
                          onLabelChange={handleLabelChange}
                          onRemove={handleRemove}
                          onToggleExpanded={(entryId) =>
                            dispatch({ type: NavigationEditorActionType.ToggleExpanded, entryId })
                          }
                          onTranslationChange={handleTranslationChange}
                        />
                      </NavigationPlacementListItem>
                    ))}
                  </NavigationPlacementList>
                </DashboardSection.Body>
              </DashboardSection>
            );
          })}
        </div>

        <DashboardSection>
          <DashboardSection.Header icon={<PlusCircleIcon weight="duotone" className="size-4" />} title={text.addItem} />
          <DashboardSection.Body>
            <AddNavigationItem
              entries={entries}
              nextId={() => temporaryId.current--}
              onAdd={(entry) => updateEntries((current) => [...current, entry])}
              pages={pages}
              text={text}
            />
          </DashboardSection.Body>
        </DashboardSection>
      </div>
    </>
  );
}

/**
 * One contextual Navigation Editor with four projections over a shared draft.
 * Semantic fields are edited once while each concrete placement owns its
 * independent position.
 */
export function NavManagerPage() {
  const messages = dashboardCopy;
  const text = NAV_TEXT;
  const common = messages.common;
  const {
    data: serverConfiguration,
    error: configurationError,
    isError: configurationIsError,
    isLoading: configurationIsLoading,
  } = useAdminNavigationConfiguration();
  const { data: pages, error: pagesError, isError: pagesIsError, isLoading: pagesIsLoading } = useContentPages();

  const loadError =
    configurationIsError && !serverConfiguration
      ? errorDetails(configurationError, text.errorLoading)
      : pagesIsError && !pages
        ? errorDetails(pagesError, text.errorLoading)
        : null;

  if (loadError) {
    return (
      <>
        <PageHeader title={text.pageTitle} />
        <NavigationErrorAlert error={loadError} />
      </>
    );
  }

  if (configurationIsLoading || pagesIsLoading || !serverConfiguration || !pages) {
    return (
      <>
        <PageHeader title={text.pageTitle} />
        <div className="text-xs text-[var(--ds-text-muted)]">{text.load}</div>
      </>
    );
  }

  return <NavigationEditor common={common} initialConfiguration={serverConfiguration} pages={pages} text={text} />;
}

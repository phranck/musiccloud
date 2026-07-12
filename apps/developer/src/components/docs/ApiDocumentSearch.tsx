/**
 * Client controller for document-wide API reference search.
 *
 * The rendered API content remains the only search source. The controller
 * indexes marked prose nodes after opening, renders accessible grouped
 * results, and coordinates modal focus, keyboard navigation, smooth scrolling,
 * URL state, and persistent in-document highlighting.
 */

import type { Icon } from "iconsax-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { SearchDialog } from "@/components/docs/SearchDialog";
import {
  buildDocumentSearchIndex,
  clearDocumentSearchHighlight,
  type DocumentSearchEntry,
  type DocumentSearchResult,
  highlightDocumentSearchMatches,
  searchDocumentIndex,
} from "@/lib/api-document-search";
import { BookIcon, CloseCircleIcon, CodeIcon, DiagramIcon, SearchNormal1Icon } from "@/lib/icons";

const SEARCH_DIALOG_CLOSE_DURATION_MS = 180;

const SearchEntryKind = {
  Chapter: "chapter",
  Operation: "operation",
  Schema: "schema",
  Sdk: "sdk",
} as const;

interface PendingSelection {
  query: string;
  result: DocumentSearchResult;
}

/** Payload for synchronizing a selected search result with the documentation sidebar. */
interface ApiSearchNavigationDetail {
  group: string;
  targetId: string;
}

/** Imperative bridge used by public navigation before React event propagation. */
type ApiSearchWindow = Window & { musiccloudApiSearchOpen?: () => void };

interface SearchState {
  activeIndex: number;
  closing: boolean;
  entries: DocumentSearchEntry[];
  open: boolean;
  query: string;
}

const SearchActionType = {
  ActiveIndex: "active-index",
  BeginClose: "begin-close",
  FinishClose: "finish-close",
  Open: "open",
  Query: "query",
} as const;

type SearchAction =
  | { type: typeof SearchActionType.Open; entries: DocumentSearchEntry[] }
  | { type: typeof SearchActionType.BeginClose }
  | { type: typeof SearchActionType.FinishClose }
  | { type: typeof SearchActionType.Query; query: string }
  | { type: typeof SearchActionType.ActiveIndex; activeIndex: number };

const INITIAL_SEARCH_STATE: SearchState = {
  activeIndex: 0,
  closing: false,
  entries: [],
  open: false,
  query: "",
};

/** Keeps the modal's tightly related interaction state atomic. */
function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case SearchActionType.Open:
      return { ...INITIAL_SEARCH_STATE, entries: action.entries, open: true };
    case SearchActionType.BeginClose:
      return { ...state, closing: true };
    case SearchActionType.FinishClose:
      return { ...state, closing: false, open: false };
    case SearchActionType.Query:
      return { ...state, activeIndex: 0, query: action.query };
    case SearchActionType.ActiveIndex:
      return { ...state, activeIndex: action.activeIndex };
  }
}

const resultIcon = (kind: string): Icon => {
  if (kind === SearchEntryKind.Chapter) return BookIcon;
  if (kind === SearchEntryKind.Operation) return DiagramIcon;
  return CodeIcon;
};

const optionId = (targetId: string, index: number) =>
  `api-search-option-${targetId.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${index}`;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keeps the sidebar in step with a programmatic content search selection. */
function synchronizeSidebarWithSearchSelection(result: DocumentSearchResult): void {
  window.dispatchEvent(
    new CustomEvent<ApiSearchNavigationDetail>("musiccloud:api-search-navigate", {
      detail: { group: result.group, targetId: result.targetId },
    }),
  );
}

function HighlightedText({ children, term }: { children: string; term: string }): ReactNode {
  const index = children.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return children;
  return (
    <>
      {children.slice(0, index)}
      <mark className="search-dialog__match">{children.slice(index, index + term.length)}</mark>
      {children.slice(index + term.length)}
    </>
  );
}

/** Persistent status affordance for clearing the current in-document search marks. */
function SearchHighlightNotice({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <aside className="api-search-highlight-notice" role="status" aria-live="polite">
      <span className="api-search-highlight-notice__text">
        {count} search {count === 1 ? "match" : "matches"} highlighted
      </span>
      <kbd className="api-search-highlight-notice__keycap">Esc</kbd>
      <button
        type="button"
        className="api-search-highlight-notice__dismiss"
        aria-label="Clear search highlights"
        title="Clear search highlights"
        onClick={onDismiss}
      >
        <CloseCircleIcon className="size-5" aria-hidden="true" />
      </button>
    </aside>
  );
}

/** Hydrated search dialog opened by the global public-navigation command. */
export function ApiDocumentSearch() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pendingSelectionRef = useRef<PendingSelection | null>(null);
  const [state, dispatch] = useReducer(searchReducer, INITIAL_SEARCH_STATE);
  const [highlightedMatchCount, setHighlightedMatchCount] = useState(0);
  const { activeIndex, closing, entries, open, query } = state;

  const groups = useMemo(() => searchDocumentIndex(entries, query), [entries, query]);
  const results = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const selectedIndex = results.length > 0 ? Math.min(activeIndex, results.length - 1) : -1;
  const selectedResult = selectedIndex >= 0 ? results[selectedIndex] : undefined;

  const openDialog = useCallback((trigger?: HTMLElement) => {
    const root = document.querySelector<HTMLElement>("[data-api-search-root]");
    if (!root) return;
    previousFocusRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    dispatch({ type: SearchActionType.Open, entries: buildDocumentSearchIndex(root) });
  }, []);

  const dismissSearchHighlights = useCallback(() => {
    clearDocumentSearchHighlight(document);
    setHighlightedMatchCount(0);
  }, []);
  const dismissHighlightsFromEscape = useEffectEvent(dismissSearchHighlights);

  const navigateToSelection = useCallback((selection: PendingSelection) => {
    const target = document.getElementById(selection.result.targetId);
    if (!target) return;
    // Resolve the live content wrapper after the dialog closes. The indexed
    // element can become stale when browser navigation updates the document.
    const searchEntry = target.closest<HTMLElement>("[data-api-search-entry]") ?? target;
    const marks = highlightDocumentSearchMatches(searchEntry, selection.query);
    setHighlightedMatchCount(marks.length);
    // The matched prose is the navigation affordance; focusing a heading adds an unrelated focus treatment.
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    window.history.pushState(null, "", `#${selection.result.targetId}`);
    synchronizeSidebarWithSearchSelection(selection.result);
  }, []);

  const finishClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    const selection = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    dispatch({ type: SearchActionType.FinishClose });
    if (selection) navigateToSelection(selection);
    else previousFocusRef.current?.focus();
  }, [navigateToSelection]);

  const closeDialog = useCallback((selection?: PendingSelection) => {
    pendingSelectionRef.current = selection ?? null;
    dispatch({ type: SearchActionType.BeginClose });
  }, []);

  useEffect(() => {
    /** Safari can lose a CustomEvent listener while an Astro island hydrates.
        Keep a direct callback as the primary bridge and retain the event for
        already-hydrated clients that still use the original integration. */
    const consumeSearchRequest = () => {
      if (dialogRef.current?.open) {
        inputRef.current?.focus();
        return;
      }
      delete document.documentElement.dataset.apiSearchRequested;
      openDialog();
    };

    const onSearchOpen = () => consumeSearchRequest();
    const apiSearchWindow = window as ApiSearchWindow;
    apiSearchWindow.musiccloudApiSearchOpen = consumeSearchRequest;
    window.addEventListener("musiccloud:api-search-open", onSearchOpen);
    document.documentElement.dataset.apiSearchReady = "true";

    if (new URLSearchParams(window.location.search).has("search")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("search");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      document.documentElement.dataset.apiSearchRequested = "true";
    }

    if (document.documentElement.dataset.apiSearchRequested === "true") {
      consumeSearchRequest();
    }

    return () => {
      window.removeEventListener("musiccloud:api-search-open", onSearchOpen);
      if (apiSearchWindow.musiccloudApiSearchOpen === consumeSearchRequest) {
        delete apiSearchWindow.musiccloudApiSearchOpen;
      }
      delete document.documentElement.dataset.apiSearchReady;
    };
  }, [openDialog]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const duration = prefersReducedMotion() ? 0 : SEARCH_DIALOG_CLOSE_DURATION_MS;
    const timer = window.setTimeout(finishClose, duration);
    return () => window.clearTimeout(timer);
  }, [closing, finishClose]);

  useEffect(() => {
    if (!highlightedMatchCount) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || dialogRef.current?.open) return;
      event.preventDefault();
      dismissHighlightsFromEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [highlightedMatchCount]);

  const selectResult = (result: DocumentSearchResult) => closeDialog({ query, result });

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      dispatch({
        type: SearchActionType.ActiveIndex,
        activeIndex: (activeIndex + direction + results.length) % results.length,
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      dispatch({
        type: SearchActionType.ActiveIndex,
        activeIndex: event.key === "Home" ? 0 : results.length - 1,
      });
      return;
    }
    if (event.key === "Enter" && selectedResult) {
      event.preventDefault();
      selectResult(selectedResult);
    }
  };

  const onDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeDialog();
  };

  let resultOffset = 0;
  return (
    <>
      <SearchDialog
        ref={dialogRef}
        aria-label="Search API reference"
        data-api-search-dialog
        data-state={closing ? "closing" : "open"}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={onDialogClick}
      >
        <SearchDialog.Header>
          <SearchDialog.Header.Title className="sr-only">Search API reference</SearchDialog.Header.Title>
          <SearchDialog.Header.Search>
            <SearchDialog.Header.Search.Icon>
              <SearchNormal1Icon className="size-5" aria-hidden="true" />
            </SearchDialog.Header.Search.Icon>
            <SearchDialog.Header.Search.Input
              ref={inputRef}
              value={query}
              role="combobox"
              aria-autocomplete="list"
              aria-controls="api-document-search-results"
              aria-activedescendant={selectedResult ? optionId(selectedResult.targetId, selectedIndex) : undefined}
              aria-expanded={open}
              aria-label="Search API reference"
              placeholder="Search the API reference"
              autoComplete="off"
              onChange={(event) => {
                dispatch({ type: SearchActionType.Query, query: event.currentTarget.value });
              }}
              onKeyDown={onSearchKeyDown}
            />
            {query && (
              <SearchDialog.Header.Search.Clear
                aria-label="Clear search"
                title="Clear search"
                onClick={() => dispatch({ type: SearchActionType.Query, query: "" })}
              >
                <CloseCircleIcon className="size-5" aria-hidden="true" />
              </SearchDialog.Header.Search.Clear>
            )}
          </SearchDialog.Header.Search>
          <SearchDialog.Header.Addon>
            <SearchDialog.Header.Close aria-label="Close search" title="Close search" onClick={() => closeDialog()}>
              <CloseCircleIcon className="size-6" aria-hidden="true" />
            </SearchDialog.Header.Close>
          </SearchDialog.Header.Addon>
        </SearchDialog.Header>

        <SearchDialog.Body>
          <SearchDialog.Body.Status className="sr-only" aria-live="polite">
            {query ? `${results.length} results` : "Search ready"}
          </SearchDialog.Body.Status>
          {query && results.length > 0 && (
            <SearchDialog.Results id="api-document-search-results">
              {groups.map((group) => {
                const groupId = `api-search-group-${group.group.replace(/[^a-zA-Z0-9]+/g, "-").toLocaleLowerCase()}`;
                const groupStart = resultOffset;
                resultOffset += group.results.length;
                return (
                  <SearchDialog.Group key={group.group} aria-labelledby={groupId} role="group">
                    <SearchDialog.Group.Header>
                      <SearchDialog.Group.Header.Title id={groupId}>{group.group}</SearchDialog.Group.Header.Title>
                      <SearchDialog.Group.Header.Addon>{group.results.length}</SearchDialog.Group.Header.Addon>
                    </SearchDialog.Group.Header>
                    <SearchDialog.Group.Items>
                      {group.results.map((result, localIndex) => {
                        const index = groupStart + localIndex;
                        const active = index === selectedIndex;
                        const ResultIcon = resultIcon(result.kind);
                        return (
                          <SearchDialog.Result
                            key={`${result.group}:${result.targetId}`}
                            id={optionId(result.targetId, index)}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => dispatch({ type: SearchActionType.ActiveIndex, activeIndex: index })}
                            onFocus={() => dispatch({ type: SearchActionType.ActiveIndex, activeIndex: index })}
                            onClick={() => selectResult(result)}
                          >
                            <SearchDialog.Result.Icon>
                              <ResultIcon className="size-5" aria-hidden={true} />
                            </SearchDialog.Result.Icon>
                            <SearchDialog.Result.Content>
                              <SearchDialog.Result.Title>
                                <HighlightedText term={query}>{result.title}</HighlightedText>
                              </SearchDialog.Result.Title>
                              <SearchDialog.Result.Snippet>
                                <HighlightedText term={result.matchedTerm}>{result.snippet}</HighlightedText>
                              </SearchDialog.Result.Snippet>
                            </SearchDialog.Result.Content>
                            {result.addon && <SearchDialog.Result.Addon>{result.addon}</SearchDialog.Result.Addon>}
                          </SearchDialog.Result>
                        );
                      })}
                    </SearchDialog.Group.Items>
                  </SearchDialog.Group>
                );
              })}
            </SearchDialog.Results>
          )}
          {!query && <SearchDialog.Empty>Type to search the complete API reference.</SearchDialog.Empty>}
          {query && results.length === 0 && <SearchDialog.Empty>No matching documentation found.</SearchDialog.Empty>}
        </SearchDialog.Body>

        <SearchDialog.Footer>
          <SearchDialog.Footer.Hints>
            <SearchDialog.Footer.Hint>↑ ↓ Navigate</SearchDialog.Footer.Hint>
            <SearchDialog.Footer.Hint>↵ Open</SearchDialog.Footer.Hint>
            <SearchDialog.Footer.Hint>Esc Close</SearchDialog.Footer.Hint>
          </SearchDialog.Footer.Hints>
        </SearchDialog.Footer>
      </SearchDialog>
      {highlightedMatchCount > 0 && (
        <SearchHighlightNotice count={highlightedMatchCount} onDismiss={dismissSearchHighlights} />
      )}
    </>
  );
}

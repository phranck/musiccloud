import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useReducer } from "react";

import { createDirtyRegistry, type DirtyRegistry, type SliceKey } from "./dirtyRegistry";
import {
  type ContentAction,
  type ContentState,
  dirtySlugs as contentDirtySlugs,
  contentReducer,
} from "./slices/contentSlice";
import { type MetaAction, type MetaState, dirtySlugs as metaDirtySlugs, metaReducer } from "./slices/metaSlice";
import {
  createInitialPublicationsState,
  type PublicationsAction,
  type PublicationsState,
  publicationDirtySlugs,
  publicationsReducer,
} from "./slices/publicationsSlice";
import { dirtyOwners, type SegmentsAction, type SegmentsState, segmentsReducer } from "./slices/segmentsSlice";
import { type SidebarAction, type SidebarState, isDirty as sidebarDirty, sidebarReducer } from "./slices/sidebarSlice";

interface PagesEditorContextValue {
  meta: MetaState;
  content: ContentState;
  publications: PublicationsState;
  segments: SegmentsState;
  sidebar: SidebarState;
  dispatch: {
    meta: (a: MetaAction) => void;
    content: (a: ContentAction) => void;
    publications: (a: PublicationsAction) => void;
    segments: (a: SegmentsAction) => void;
    sidebar: (a: SidebarAction) => void;
  };
  dirty: DirtyRegistry;
  resetAll: () => void;
}

const Ctx = createContext<PagesEditorContextValue | null>(null);

export function PagesEditorProvider({ children }: { children: ReactNode }) {
  const [meta, dispatchMeta] = useReducer(metaReducer, { pages: {} });
  const [content, dispatchContent] = useReducer(contentReducer, { pages: {} });
  const [publications, dispatchPublications] = useReducer(
    publicationsReducer,
    undefined,
    createInitialPublicationsState,
  );
  const [segments, dispatchSegments] = useReducer(segmentsReducer, { byOwner: {} });
  const [sidebar, dispatchSidebar] = useReducer(sidebarReducer, { initial: [], current: [] });
  const dirty = useMemo(() => createDirtyRegistry(), []);

  useEffect(() => {
    dirty.clear();
    if (sidebarDirty(sidebar)) dirty.add("sidebar");
    for (const s of metaDirtySlugs(meta)) dirty.add(`meta:${s}` as SliceKey);
    for (const s of contentDirtySlugs(content)) dirty.add(`content:${s}` as SliceKey);
    for (const s of publicationDirtySlugs(publications)) dirty.add(`publications:${s}` as SliceKey);
    for (const o of dirtyOwners(segments)) dirty.add(`segments:${o}` as SliceKey);
  }, [dirty, meta, content, publications, segments, sidebar]);

  const resetAll = useCallback(() => {
    dispatchMeta({ type: "reset" });
    dispatchContent({ type: "reset" });
    dispatchPublications({ type: "reset" });
    dispatchSegments({ type: "reset" });
    dispatchSidebar({ type: "reset" });
  }, []);

  // dispatchers from useReducer are guaranteed stable across renders, so we
  // memoize the dispatch bag once and keep its reference identical for the
  // entire provider lifetime. Otherwise consumers that depend on
  // `editor.dispatch` in effects would re-fire on every state update.
  const dispatchBag = useMemo<PagesEditorContextValue["dispatch"]>(
    () => ({
      meta: dispatchMeta,
      content: dispatchContent,
      publications: dispatchPublications,
      segments: dispatchSegments,
      sidebar: dispatchSidebar,
    }),
    [],
  );

  const value = useMemo<PagesEditorContextValue>(
    () => ({
      meta,
      content,
      publications,
      segments,
      sidebar,
      dispatch: dispatchBag,
      dirty,
      resetAll,
    }),
    [meta, content, publications, segments, sidebar, resetAll, dispatchBag, dirty],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePagesEditor(): PagesEditorContextValue {
  const v = use(Ctx);
  if (!v) throw new Error("usePagesEditor must be used within PagesEditorProvider");
  return v;
}

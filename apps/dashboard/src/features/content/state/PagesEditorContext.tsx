import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { createDirtyRegistry, type DirtyRegistry, type SliceKey } from "./dirtyRegistry";
import {
  type ContentAction,
  type ContentState,
  dirtySlugs as contentDirtySlugs,
  contentReducer,
} from "./slices/contentSlice";
import { type MetaAction, type MetaState, dirtySlugs as metaDirtySlugs, metaReducer } from "./slices/metaSlice";
import { dirtyOwners, type SegmentsAction, type SegmentsState, segmentsReducer } from "./slices/segmentsSlice";
import { type SidebarAction, type SidebarState, isDirty as sidebarDirty, sidebarReducer } from "./slices/sidebarSlice";
import {
  dirtyEntries,
  type TranslationsAction,
  type TranslationsState,
  translationsReducer,
} from "./slices/translationsSlice";

interface PagesEditorContextValue {
  meta: MetaState;
  content: ContentState;
  segments: SegmentsState;
  translations: TranslationsState;
  sidebar: SidebarState;
  dispatch: {
    meta: (a: MetaAction) => void;
    content: (a: ContentAction) => void;
    segments: (a: SegmentsAction) => void;
    translations: (a: TranslationsAction) => void;
    sidebar: (a: SidebarAction) => void;
  };
  dirty: DirtyRegistry;
  resetAll: () => void;
}

const Ctx = createContext<PagesEditorContextValue | null>(null);

export function PagesEditorProvider({ children }: { children: ReactNode }) {
  const [meta, dispatchMeta] = useReducer(metaReducer, { pages: {} });
  const [content, dispatchContent] = useReducer(contentReducer, { pages: {} });
  const [segments, dispatchSegments] = useReducer(segmentsReducer, { byOwner: {} });
  const [translations, dispatchTranslations] = useReducer(translationsReducer, { byPage: {} });
  const [sidebar, dispatchSidebar] = useReducer(sidebarReducer, { initial: [], current: [] });
  const dirtyRef = useRef<DirtyRegistry>(createDirtyRegistry());

  useEffect(() => {
    const reg = dirtyRef.current;
    reg.clear();
    if (sidebarDirty(sidebar)) reg.add("sidebar");
    for (const s of metaDirtySlugs(meta)) reg.add(`meta:${s}` as SliceKey);
    for (const s of contentDirtySlugs(content)) reg.add(`content:${s}` as SliceKey);
    for (const o of dirtyOwners(segments)) reg.add(`segments:${o}` as SliceKey);
    for (const { slug } of dirtyEntries(translations)) reg.add(`translations:${slug}` as SliceKey);
  }, [meta, content, segments, translations, sidebar]);

  const resetAll = useCallback(() => {
    dispatchMeta({ type: "reset" });
    dispatchContent({ type: "reset" });
    dispatchSegments({ type: "reset" });
    dispatchTranslations({ type: "reset" });
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
      segments: dispatchSegments,
      translations: dispatchTranslations,
      sidebar: dispatchSidebar,
    }),
    [],
  );

  const value = useMemo<PagesEditorContextValue>(
    () => ({
      meta,
      content,
      segments,
      translations,
      sidebar,
      dispatch: dispatchBag,
      dirty: dirtyRef.current,
      resetAll,
    }),
    [meta, content, segments, translations, sidebar, resetAll, dispatchBag],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePagesEditor(): PagesEditorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePagesEditor must be used within PagesEditorProvider");
  return v;
}

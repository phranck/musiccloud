import type { ContentPage } from "@musiccloud/shared";

export type MetaFields = Pick<
  ContentPage,
  | "title"
  | "slug"
  | "status"
  | "showTitle"
  | "titleAlignment"
  | "pageType"
  | "displayMode"
  | "overlayWidth"
  | "contentCardStyle"
>;

export interface MetaState {
  pages: Record<string, { initial: MetaFields; current: MetaFields }>;
}

export type MetaAction =
  | { type: "hydrate"; entries: Array<{ slug: string; meta: MetaFields }> }
  | { type: "set-field"; slug: string; field: keyof MetaFields; value: MetaFields[keyof MetaFields] }
  | { type: "reset" };

export function metaReducer(state: MetaState, action: MetaAction): MetaState {
  switch (action.type) {
    case "hydrate": {
      const pages: MetaState["pages"] = {};
      for (const e of action.entries) pages[e.slug] = { initial: e.meta, current: e.meta };
      return { pages };
    }
    case "set-field": {
      const entry = state.pages[action.slug];
      if (!entry) return state;
      const next = { ...entry.current, [action.field]: action.value };
      return { ...state, pages: { ...state.pages, [action.slug]: { ...entry, current: next } } };
    }
    case "reset":
      return {
        pages: Object.fromEntries(Object.entries(state.pages).map(([k, v]) => [k, { ...v, current: v.initial }])),
      };
    default:
      return state;
  }
}

export function dirtySlugs(s: MetaState): string[] {
  return Object.entries(s.pages)
    .filter(([, v]) => !shallowEqual(v.initial, v.current))
    .map(([k]) => k);
}

export function isMetaDirty(s: MetaState, slug: string): boolean {
  const e = s.pages[slug];
  if (!e) return false;
  return !shallowEqual(e.initial, e.current);
}

export function isMetaFieldDirty<K extends keyof MetaFields>(s: MetaState, slug: string, field: K): boolean {
  const e = s.pages[slug];
  if (!e) return false;
  return e.initial[field] !== e.current[field];
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  for (const k of Object.keys(a) as Array<keyof T>) if (a[k] !== b[k]) return false;
  for (const k of Object.keys(b) as Array<keyof T>) if (a[k] !== b[k]) return false;
  return true;
}

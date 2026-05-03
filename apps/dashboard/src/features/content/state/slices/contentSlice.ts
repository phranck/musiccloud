export interface ContentState {
  pages: Record<string, { initial: string; current: string }>;
}

export type ContentAction =
  | { type: "hydrate"; entries: Array<{ slug: string; content: string }> }
  | { type: "set"; slug: string; value: string }
  | { type: "reset" };

export function contentReducer(state: ContentState, action: ContentAction): ContentState {
  switch (action.type) {
    case "hydrate": {
      const pages: ContentState["pages"] = {};
      for (const e of action.entries) pages[e.slug] = { initial: e.content, current: e.content };
      return { pages };
    }
    case "set": {
      const entry = state.pages[action.slug];
      if (!entry) return { pages: { ...state.pages, [action.slug]: { initial: "", current: action.value } } };
      return { pages: { ...state.pages, [action.slug]: { ...entry, current: action.value } } };
    }
    case "reset":
      return {
        pages: Object.fromEntries(Object.entries(state.pages).map(([k, v]) => [k, { ...v, current: v.initial }])),
      };
    default:
      return state;
  }
}

export function dirtySlugs(s: ContentState): string[] {
  return Object.entries(s.pages)
    .filter(([, v]) => v.initial !== v.current)
    .map(([k]) => k);
}

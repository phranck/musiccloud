type TranslationFields = { title?: string; content?: string; translationReady?: boolean };

export interface TranslationsState {
  byPage: Record<string, Record<string /* locale */, { initial: TranslationFields; current: TranslationFields }>>;
}

export type TranslationsAction =
  | { type: "hydrate"; entries: Array<{ slug: string; locale: string } & TranslationFields> }
  | {
      type: "set-field";
      slug: string;
      locale: string;
      field: keyof TranslationFields;
      value: TranslationFields[keyof TranslationFields];
    }
  | { type: "add-locale"; slug: string; locale: string; fields: TranslationFields }
  | { type: "reset" };

export function translationsReducer(state: TranslationsState, action: TranslationsAction): TranslationsState {
  switch (action.type) {
    case "hydrate": {
      const byPage: TranslationsState["byPage"] = {};
      for (const e of action.entries) {
        const fields: TranslationFields = {
          ...(e.title !== undefined ? { title: e.title } : {}),
          ...(e.content !== undefined ? { content: e.content } : {}),
          ...(e.translationReady !== undefined ? { translationReady: e.translationReady } : {}),
        };
        byPage[e.slug] = { ...(byPage[e.slug] ?? {}), [e.locale]: { initial: fields, current: fields } };
      }
      return { byPage };
    }
    case "set-field": {
      const page = state.byPage[action.slug];
      if (!page) return state;
      const entry = page[action.locale];
      if (!entry) return state;
      const next = { ...entry.current, [action.field]: action.value };
      return {
        byPage: {
          ...state.byPage,
          [action.slug]: { ...page, [action.locale]: { ...entry, current: next } },
        },
      };
    }
    case "add-locale": {
      const emptyInitial: TranslationFields = { title: "", content: "", translationReady: false };
      const page = state.byPage[action.slug] ?? {};
      return {
        byPage: {
          ...state.byPage,
          [action.slug]: { ...page, [action.locale]: { initial: emptyInitial, current: action.fields } },
        },
      };
    }
    case "reset": {
      const byPage: TranslationsState["byPage"] = {};
      for (const [slug, locales] of Object.entries(state.byPage)) {
        byPage[slug] = {};
        for (const [locale, v] of Object.entries(locales)) {
          byPage[slug][locale] = { ...v, current: v.initial };
        }
      }
      return { byPage };
    }
    default:
      return state;
  }
}

function fieldsEqual(a: TranslationFields, b: TranslationFields): boolean {
  return a.title === b.title && a.content === b.content && a.translationReady === b.translationReady;
}

export function dirtyEntries(s: TranslationsState): Array<{ slug: string; locale: string }> {
  const out: Array<{ slug: string; locale: string }> = [];
  for (const [slug, locales] of Object.entries(s.byPage)) {
    for (const [locale, v] of Object.entries(locales)) {
      if (!fieldsEqual(v.initial, v.current)) out.push({ slug, locale });
    }
  }
  return out;
}

export function isTranslationDirty(s: TranslationsState, slug: string, locale: string): boolean {
  const entry = s.byPage[slug]?.[locale];
  if (!entry) return false;
  return !fieldsEqual(entry.initial, entry.current);
}

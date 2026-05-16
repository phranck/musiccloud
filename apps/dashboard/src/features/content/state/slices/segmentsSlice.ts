import {
  DEFAULT_LOCALE,
  getLocalizedText,
  type Locale,
  type LocalizedText,
  normalizeLocalizedText,
  type PageSegmentInput,
  setLocalizedText,
} from "@musiccloud/shared";

export interface SegmentEntry {
  position: number;
  label: LocalizedText;
  targetSlug: string;
}

export interface SegmentsState {
  byOwner: Record<string, { initial: SegmentEntry[]; current: SegmentEntry[] }>;
}

export interface SegmentEntryInput {
  position: number;
  label: string | LocalizedText;
  targetSlug: string;
  translations?: Partial<Record<string, string>>;
}

export type SegmentsAction =
  | { type: "hydrate"; entries: Array<{ ownerSlug: string; segments: SegmentEntryInput[] }> }
  | { type: "hydrate-owner"; ownerSlug: string; segments: SegmentEntryInput[] }
  | { type: "reorder"; owner: string; from: number; to: number }
  | { type: "move"; target: string; from: string; to: string; position: number }
  | { type: "add"; owner: string; target: string; position: number; label?: string }
  | { type: "remove"; owner: string; target: string }
  | { type: "set-label"; owner: string; target: string; locale: Locale; label: string }
  | { type: "set-translation"; owner: string; target: string; locale: string; label: string }
  | { type: "reset" };

function reposition(arr: SegmentEntry[]): SegmentEntry[] {
  return arr.map((s, i) => ({ ...s, position: i }));
}

export function normalizeSegmentEntry(entry: SegmentEntryInput): SegmentEntry {
  return {
    position: entry.position,
    label: normalizeLocalizedText(entry.label, { translations: entry.translations }).value,
    targetSlug: entry.targetSlug,
  };
}

export function segmentsReducer(state: SegmentsState, action: SegmentsAction): SegmentsState {
  switch (action.type) {
    case "hydrate": {
      const byOwner: SegmentsState["byOwner"] = {};
      for (const e of action.entries) {
        const segments = e.segments.map(normalizeSegmentEntry);
        byOwner[e.ownerSlug] = { initial: segments, current: segments };
      }
      return { byOwner };
    }
    case "hydrate-owner": {
      const segments = action.segments.map(normalizeSegmentEntry);
      return {
        byOwner: {
          ...state.byOwner,
          [action.ownerSlug]: { initial: segments, current: segments },
        },
      };
    }
    case "reorder": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      const next = entry.current.slice();
      const [moved] = next.splice(action.from, 1);
      if (!moved) return state;
      next.splice(action.to, 0, moved);
      return { byOwner: { ...state.byOwner, [action.owner]: { ...entry, current: reposition(next) } } };
    }
    case "move": {
      const fromEntry = state.byOwner[action.from];
      const toEntry = state.byOwner[action.to];
      if (!fromEntry || !toEntry) return state;
      const fromCurrent = fromEntry.current.filter((s) => s.targetSlug !== action.target);
      const removed = fromEntry.current.find((s) => s.targetSlug === action.target);
      if (!removed) return state;
      const toCurrent = toEntry.current.slice();
      toCurrent.splice(action.position, 0, { ...removed, position: action.position });
      return {
        byOwner: {
          ...state.byOwner,
          [action.from]: { ...fromEntry, current: reposition(fromCurrent) },
          [action.to]: { ...toEntry, current: reposition(toCurrent) },
        },
      };
    }
    case "add": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      const next = entry.current.slice();
      next.splice(action.position, 0, {
        position: action.position,
        label: { [DEFAULT_LOCALE]: action.label ?? action.target },
        targetSlug: action.target,
      });
      return { byOwner: { ...state.byOwner, [action.owner]: { ...entry, current: reposition(next) } } };
    }
    case "remove": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: {
            ...entry,
            current: reposition(entry.current.filter((s) => s.targetSlug !== action.target)),
          },
        },
      };
    }
    case "set-label": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: {
            ...entry,
            current: entry.current.map((s) =>
              s.targetSlug === action.target
                ? { ...s, label: setLocalizedText(s.label, action.locale, action.label) }
                : s,
            ),
          },
        },
      };
    }
    case "set-translation": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: {
            ...entry,
            current: entry.current.map((s) =>
              s.targetSlug === action.target
                ? { ...s, label: setLocalizedText(s.label, action.locale as Locale, action.label) }
                : s,
            ),
          },
        },
      };
    }
    case "reset":
      return {
        byOwner: Object.fromEntries(Object.entries(state.byOwner).map(([k, v]) => [k, { ...v, current: v.initial }])),
      };
    default:
      return state;
  }
}

export function dirtyOwners(s: SegmentsState): string[] {
  return Object.entries(s.byOwner)
    .filter(([, v]) => !sameSegments(v.initial, v.current))
    .map(([k]) => k);
}

function sameSegments(a: SegmentEntry[], b: SegmentEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].position !== b[i].position) return false;
    if (!sameLocalizedText(a[i].label, b[i].label)) return false;
    if (a[i].targetSlug !== b[i].targetSlug) return false;
  }
  return true;
}

function sameLocalizedText(a: LocalizedText, b: LocalizedText): boolean {
  const locales = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const locale of locales) {
    if (a[locale as Locale] !== b[locale as Locale]) return false;
  }
  return true;
}

export function toBulkSegmentsInput(s: SegmentsState["byOwner"][string]["current"]): PageSegmentInput[] {
  return s.map((e) => {
    const defaultLabel = getLocalizedText(e.label, DEFAULT_LOCALE, DEFAULT_LOCALE).value;
    const translations = Object.fromEntries(
      Object.entries(e.label).filter(
        ([locale, label]) => locale !== DEFAULT_LOCALE && typeof label === "string" && label.length > 0,
      ),
    );
    return {
      position: e.position,
      label: defaultLabel,
      targetSlug: e.targetSlug,
      ...(Object.keys(translations).length > 0 ? { translations } : {}),
    };
  });
}

import type { PageSegmentInput } from "@musiccloud/shared";

export interface SegmentEntry {
  position: number;
  label: string;
  targetSlug: string;
  translations?: Record<string, string>;
}

export interface SegmentsState {
  byOwner: Record<string, { initial: SegmentEntry[]; current: SegmentEntry[] }>;
}

export type SegmentsAction =
  | { type: "hydrate"; entries: Array<{ ownerSlug: string; segments: SegmentEntry[] }> }
  | { type: "reorder"; owner: string; from: number; to: number }
  | { type: "move"; target: string; from: string; to: string; position: number }
  | { type: "add"; owner: string; target: string; position: number; label?: string }
  | { type: "remove"; owner: string; target: string }
  | { type: "set-label"; owner: string; target: string; label: string }
  | { type: "set-translation"; owner: string; target: string; locale: string; label: string }
  | { type: "reset" };

function reposition(arr: SegmentEntry[]): SegmentEntry[] {
  return arr.map((s, i) => ({ ...s, position: i }));
}

export function segmentsReducer(state: SegmentsState, action: SegmentsAction): SegmentsState {
  switch (action.type) {
    case "hydrate": {
      const byOwner: SegmentsState["byOwner"] = {};
      for (const e of action.entries) byOwner[e.ownerSlug] = { initial: e.segments, current: e.segments };
      return { byOwner };
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
        label: action.label ?? action.target,
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
            current: entry.current.map((s) => (s.targetSlug === action.target ? { ...s, label: action.label } : s)),
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
                ? { ...s, translations: { ...(s.translations ?? {}), [action.locale]: action.label } }
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
    if (a[i].label !== b[i].label) return false;
    if (a[i].targetSlug !== b[i].targetSlug) return false;
    if (JSON.stringify(a[i].translations ?? {}) !== JSON.stringify(b[i].translations ?? {})) return false;
  }
  return true;
}

export function toBulkSegmentsInput(s: SegmentsState["byOwner"][string]["current"]): PageSegmentInput[] {
  return s.map((e) => ({
    position: e.position,
    label: e.label,
    targetSlug: e.targetSlug,
    ...(e.translations ? { translations: e.translations } : {}),
  }));
}

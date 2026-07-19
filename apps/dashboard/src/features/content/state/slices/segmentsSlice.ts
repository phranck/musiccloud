import type { PageSegmentInput } from "@musiccloud/shared";

export interface SegmentEntry {
  position: number;
  label: string;
  targetSlug: string;
}

export interface SegmentsState {
  byOwner: Record<string, { initial: SegmentEntry[]; current: SegmentEntry[] }>;
}

export interface SegmentEntryInput {
  position: number;
  label: string;
  targetSlug: string;
}

export const SegmentsActionType = {
  Hydrate: "hydrate",
  HydrateOwner: "hydrate-owner",
  Reorder: "reorder",
  Move: "move",
  Add: "add",
  Remove: "remove",
  SetLabel: "set-label",
  Reset: "reset",
} as const;

export type SegmentsAction =
  | { type: typeof SegmentsActionType.Hydrate; entries: Array<{ ownerSlug: string; segments: SegmentEntryInput[] }> }
  | { type: typeof SegmentsActionType.HydrateOwner; ownerSlug: string; segments: SegmentEntryInput[] }
  | { type: typeof SegmentsActionType.Reorder; owner: string; from: number; to: number }
  | { type: typeof SegmentsActionType.Move; target: string; from: string; to: string; position: number }
  | { type: typeof SegmentsActionType.Add; owner: string; target: string; position: number; label?: string }
  | { type: typeof SegmentsActionType.Remove; owner: string; target: string }
  | { type: typeof SegmentsActionType.SetLabel; owner: string; target: string; label: string }
  | { type: typeof SegmentsActionType.Reset };

function reposition(arr: SegmentEntry[]): SegmentEntry[] {
  return arr.map((s, i) => ({ ...s, position: i }));
}

export function normalizeSegmentEntry(entry: SegmentEntryInput): SegmentEntry {
  return {
    position: entry.position,
    label: entry.label,
    targetSlug: entry.targetSlug,
  };
}

export function segmentsReducer(state: SegmentsState, action: SegmentsAction): SegmentsState {
  switch (action.type) {
    case SegmentsActionType.Hydrate: {
      const byOwner: SegmentsState["byOwner"] = {};
      for (const e of action.entries) {
        const segments = e.segments.map(normalizeSegmentEntry);
        byOwner[e.ownerSlug] = { initial: segments, current: segments };
      }
      return { byOwner };
    }
    case SegmentsActionType.HydrateOwner: {
      const segments = action.segments.map(normalizeSegmentEntry);
      return {
        byOwner: {
          ...state.byOwner,
          [action.ownerSlug]: { initial: segments, current: segments },
        },
      };
    }
    case SegmentsActionType.Reorder: {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      const next = entry.current.slice();
      const [moved] = next.splice(action.from, 1);
      if (!moved) return state;
      next.splice(action.to, 0, moved);
      return { byOwner: { ...state.byOwner, [action.owner]: { ...entry, current: reposition(next) } } };
    }
    case SegmentsActionType.Move: {
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
    case SegmentsActionType.Add: {
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
    case SegmentsActionType.Remove: {
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
    case SegmentsActionType.SetLabel: {
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
    case SegmentsActionType.Reset:
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
  }
  return true;
}

export function toBulkSegmentsInput(s: SegmentsState["byOwner"][string]["current"]): PageSegmentInput[] {
  return s.map((entry) => ({
    position: entry.position,
    label: entry.label,
    targetSlug: entry.targetSlug,
  }));
}

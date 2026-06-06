import { arrayMove } from "@dnd-kit/sortable";

export interface SidebarState {
  initial: string[];
  current: string[];
}

export const SidebarActionType = {
  Hydrate: "hydrate",
  ReorderTopLevel: "reorder-top-level",
  Reset: "reset",
} as const;

export type SidebarAction =
  | { type: typeof SidebarActionType.Hydrate; topLevelOrder: string[] }
  | { type: typeof SidebarActionType.ReorderTopLevel; from: number; to: number }
  | { type: typeof SidebarActionType.Reset };

export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case SidebarActionType.Hydrate:
      return { initial: action.topLevelOrder, current: action.topLevelOrder };
    case SidebarActionType.ReorderTopLevel:
      return { ...state, current: arrayMove(state.current, action.from, action.to) };
    case SidebarActionType.Reset:
      return { ...state, current: state.initial };
    default:
      return state;
  }
}

export function isDirty(s: SidebarState): boolean {
  if (s.initial.length !== s.current.length) return true;
  for (let i = 0; i < s.initial.length; i++) if (s.initial[i] !== s.current[i]) return true;
  return false;
}

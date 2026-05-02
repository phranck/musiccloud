import { arrayMove } from "@dnd-kit/sortable";

export interface SidebarState {
  initial: string[];
  current: string[];
}

export type SidebarAction =
  | { type: "hydrate"; topLevelOrder: string[] }
  | { type: "reorder-top-level"; from: number; to: number }
  | { type: "reset" };

export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "hydrate":
      return { initial: action.topLevelOrder, current: action.topLevelOrder };
    case "reorder-top-level":
      return { ...state, current: arrayMove(state.current, action.from, action.to) };
    case "reset":
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

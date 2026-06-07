import { createContext, type ReactNode, use, useCallback, useMemo, useReducer } from "react";

interface PageHeaderState {
  title: string;
  titleContent: ReactNode | null;
  leadingEl: HTMLDivElement | null;
  actionsEl: HTMLDivElement | null;
}

const PageHeaderActionType = {
  SetTitle: "setTitle",
  ClearTitle: "clearTitle",
  SetLeadingEl: "setLeadingEl",
  SetActionsEl: "setActionsEl",
} as const;

type PageHeaderAction =
  | { type: typeof PageHeaderActionType.SetTitle; title: string; titleContent: ReactNode | null }
  | { type: typeof PageHeaderActionType.ClearTitle }
  | { type: typeof PageHeaderActionType.SetLeadingEl; el: HTMLDivElement | null }
  | { type: typeof PageHeaderActionType.SetActionsEl; el: HTMLDivElement | null };

const initialState: PageHeaderState = {
  title: "",
  titleContent: null,
  leadingEl: null,
  actionsEl: null,
};

function reducer(state: PageHeaderState, action: PageHeaderAction): PageHeaderState {
  switch (action.type) {
    case PageHeaderActionType.SetTitle:
      return { ...state, title: action.title, titleContent: action.titleContent };
    case PageHeaderActionType.ClearTitle:
      return { ...state, title: "", titleContent: null };
    case PageHeaderActionType.SetLeadingEl:
      return { ...state, leadingEl: action.el };
    case PageHeaderActionType.SetActionsEl:
      return { ...state, actionsEl: action.el };
  }
}

interface PageHeaderContextValue extends PageHeaderState {
  setTitle: (title: string, content: ReactNode | null) => void;
  clearTitle: () => void;
  setLeadingEl: (el: HTMLDivElement | null) => void;
  setActionsEl: (el: HTMLDivElement | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  ...initialState,
  setTitle: () => {},
  clearTitle: () => {},
  setLeadingEl: () => {},
  setActionsEl: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Setters MUST have stable identities across renders.
  //
  // `PageHeader.tsx` lists `setTitle`/`clearTitle` in its useEffect deps (and
  // must, because React's exhaustive-deps lint would otherwise complain). If we
  // inline the setters into the `useMemo(value, [state])` below, every state
  // change produces a new value object AND new setter function references.
  // PageHeader's effect then re-fires, calls setTitle, mutates state, produces
  // a new value — infinite loop. React catches this and throws "Maximum update
  // depth exceeded".
  //
  // `dispatch` from useReducer is guaranteed stable across renders by React,
  // so `useCallback(..., [])` is safe here — the closure captures only
  // dispatch, which never changes.
  //
  // The original context worked because plain useState setters are also
  // stable by React's contract; swapping them out for a reducer requires
  // manually preserving that guarantee.
  const setTitle = useCallback(
    (title: string, titleContent: ReactNode | null) =>
      dispatch({ type: PageHeaderActionType.SetTitle, title, titleContent }),
    [],
  );
  const clearTitle = useCallback(() => dispatch({ type: PageHeaderActionType.ClearTitle }), []);
  const setLeadingEl = useCallback(
    (el: HTMLDivElement | null) => dispatch({ type: PageHeaderActionType.SetLeadingEl, el }),
    [],
  );
  const setActionsEl = useCallback(
    (el: HTMLDivElement | null) => dispatch({ type: PageHeaderActionType.SetActionsEl, el }),
    [],
  );

  const value = useMemo<PageHeaderContextValue>(
    () => ({ ...state, setTitle, clearTitle, setLeadingEl, setActionsEl }),
    [state, setTitle, clearTitle, setLeadingEl, setActionsEl],
  );

  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderContext() {
  return use(PageHeaderContext);
}

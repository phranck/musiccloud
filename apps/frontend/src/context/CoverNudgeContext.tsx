import { createContext, type ReactNode, use, useMemo } from "react";

interface CoverNudgeContextValue {
  requested: boolean;
  onComplete: () => void;
}

const CoverNudgeContext = createContext<CoverNudgeContextValue | null>(null);

/** Shares the page owner's single nudge request with whichever responsive media card is currently mounted. */
export function CoverNudgeProvider({
  requested,
  onComplete,
  children,
}: CoverNudgeContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ requested, onComplete }), [requested, onComplete]);
  return <CoverNudgeContext.Provider value={value}>{children}</CoverNudgeContext.Provider>;
}

/** Returns the current page-owned nudge request, or null outside a ShareLayout provider. */
export function useCoverNudgeRequest(): CoverNudgeContextValue | null {
  return use(CoverNudgeContext);
}

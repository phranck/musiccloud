import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";
import { Toast, type ToastVariant } from "@/components/ui/Toast";

interface ToastAPI {
  show: (message: string, variant?: ToastVariant) => void;
}

interface ToastState {
  message: string;
  variant: ToastVariant;
  visible: boolean;
}

const ToastCtx = createContext<ToastAPI | null>(null);

const INITIAL: ToastState = { message: "", variant: "info", visible: false };

/**
 * Renders `<Toast>` inside its own tree and exposes `show(message, variant)`
 * via context. Descendants read the API through `useToastSafe()` — the
 * hook returns `null` when rendered outside the provider so leaf components
 * can degrade to a silent no-op.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(INITIAL);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    setState({ message, variant, visible: true });
  }, []);

  const dismiss = useCallback(() => setState((prev) => ({ ...prev, visible: false })), []);

  const api = useMemo<ToastAPI>(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <Toast message={state.message} variant={state.variant} visible={state.visible} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

/** Returns the toast API, or `null` when rendered outside a `ToastProvider`. */
export function useToastSafe(): ToastAPI | null {
  return use(ToastCtx);
}

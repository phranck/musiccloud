import { useCallback, useState } from "react";

export interface ToastState {
  message: string;
  variant: "success" | "error" | "info";
  visible: boolean;
}

const INITIAL: ToastState = { message: "", variant: "info", visible: false };

export function useToast() {
  const [state, setState] = useState<ToastState>(INITIAL);
  const show = useCallback((message: string, variant: ToastState["variant"] = "info") => {
    setState({ message, variant, visible: true });
  }, []);
  const dismiss = useCallback(() => setState((prev) => ({ ...prev, visible: false })), []);
  return { state, show, dismiss };
}

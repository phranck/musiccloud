import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { dialogTransitionMs } from "@/components/ui/dialogGeometry";
import { useT } from "@/i18n/localeContext";

export const DialogType = {
  ErrorAlert: "error-alert",
} as const;

interface ShowErrorAlertRequest {
  message: string;
  onDismiss?: () => void;
}

type DialogState = {
  type: typeof DialogType.ErrorAlert;
  message: string;
} | null;

interface DialogContextValue {
  showErrorAlert: (request: ShowErrorAlertRequest) => void;
  dismissDialog: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface DialogProviderProps {
  children: ReactNode;
}

export function DialogProvider({ children }: DialogProviderProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [visible, setVisible] = useState(false);
  const dialogOpen = Boolean(dialog);
  const onDismissRef = useRef<(() => void) | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScheduledWork = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const showErrorAlert = useCallback(
    (request: ShowErrorAlertRequest) => {
      clearScheduledWork();
      onDismissRef.current = request.onDismiss;
      setDialog({
        type: DialogType.ErrorAlert,
        message: request.message,
      });
      setVisible(false);
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        setVisible(true);
      });
    },
    [clearScheduledWork],
  );

  const dismissDialog = useCallback(() => {
    if (!dialog) return;

    clearScheduledWork();
    const onDismiss = onDismissRef.current;
    onDismissRef.current = undefined;
    setVisible(false);
    onDismiss?.();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setDialog(null);
    }, dialogTransitionMs);
  }, [clearScheduledWork, dialog]);

  const handleEscapeKey = useEffectEvent((event: KeyboardEvent) => {
    if (!dialogOpen || !visible || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismissDialog();
  });

  useEffect(() => clearScheduledWork, [clearScheduledWork]);

  useEffect(() => {
    if (!dialogOpen || !visible) return;
    document.addEventListener("keydown", handleEscapeKey, true);
    return () => document.removeEventListener("keydown", handleEscapeKey, true);
  }, [dialogOpen, visible]);

  const value = useMemo(() => ({ showErrorAlert, dismissDialog }), [showErrorAlert, dismissDialog]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <DialogHost dialog={dialog} visible={visible} onClose={dismissDialog} />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = use(DialogContext);
  if (!context) throw new Error("useDialog must be used within DialogProvider");
  return context;
}

function DialogHost({ dialog, visible, onClose }: { dialog: DialogState; visible: boolean; onClose: () => void }) {
  const t = useT();

  if (!dialog) return null;

  switch (dialog.type) {
    case DialogType.ErrorAlert:
      return (
        <AlertDialog
          open
          visible={visible}
          title={t("error.dialogTitle")}
          message={dialog.message}
          closeLabel={t("error.dismiss")}
          onClose={onClose}
        />
      );
  }
}

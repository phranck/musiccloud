import { useEffect, useEffectEvent } from "react";
import { useDialog } from "@/context/DialogContext";

interface LandingPageErrorAlertProps {
  message?: string;
  onDismiss: () => void;
}

export function LandingPageErrorAlert({ message, onDismiss }: LandingPageErrorAlertProps) {
  const { showErrorAlert } = useDialog();
  const handleDismiss = useEffectEvent(() => {
    onDismiss();
  });

  useEffect(() => {
    if (!message) return;
    showErrorAlert({ message, onDismiss: handleDismiss });
  }, [message, showErrorAlert]);

  return null;
}

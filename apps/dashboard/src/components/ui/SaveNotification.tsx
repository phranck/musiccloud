import { CheckCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type SaveNotificationPhase as Phase, SaveNotificationPhase } from "@/components/ui/SaveNotificationTypes";

const DISPLAY_DURATION = 5000;
const ANIMATION_DURATION = 250;

export function useSaveNotification() {
  const [phase, setPhase] = useState<Phase>(SaveNotificationPhase.Hidden);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    clearTimeout(timerRef.current);
    setPhase(SaveNotificationPhase.Entering);
    timerRef.current = setTimeout(() => {
      setPhase(SaveNotificationPhase.Visible);
      timerRef.current = setTimeout(() => {
        setPhase(SaveNotificationPhase.Exiting);
        timerRef.current = setTimeout(() => setPhase(SaveNotificationPhase.Hidden), ANIMATION_DURATION);
      }, DISPLAY_DURATION);
    }, ANIMATION_DURATION);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { phase, show };
}

interface SaveNotificationProps {
  phase: Phase;
  label: string;
}

export function SaveNotification({ phase, label }: SaveNotificationProps) {
  if (phase === SaveNotificationPhase.Hidden) return null;

  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-medium text-green-500 save-notification-${phase === SaveNotificationPhase.Exiting ? "exit" : "enter"}`}
    >
      <CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

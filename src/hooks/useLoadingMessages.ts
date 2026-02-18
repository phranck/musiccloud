import { useEffect, useRef, useState } from "react";
import type { InputState } from "@/lib/types/app";

/**
 * Progressive loading messages for the HeroInput loading state.
 * Returns the current message to display while loading.
 */
export function useLoadingMessages(
  state: InputState,
  t: (key: string) => string,
): string {
  const [loadingMessage, setLoadingMessage] = useState("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (state !== "loading") {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    setLoadingMessage(t("loading.finding"));
    const timer = setTimeout(() => setLoadingMessage(t("loading.still")), 2000);
    timersRef.current = [timer];

    return () => clearTimeout(timer);
  }, [state, t]);

  return loadingMessage;
}

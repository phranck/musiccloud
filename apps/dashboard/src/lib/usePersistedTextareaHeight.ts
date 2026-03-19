import { useEffect } from "react";

import { useAuth } from "@/features/auth/AuthContext";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";

export function usePersistedTextareaHeight(textareaId: string, storageKey: string, enabled = true) {
  const { user } = useAuth();
  const fullKey = getSegmentedStorageKey(user?.id, storageKey);

  useEffect(() => {
    if (!enabled) return;

    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!el) return;

    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        const h = JSON.parse(raw);
        if (typeof h === "number" && h > 30) {
          el.style.height = `${h}px`;
        }
      }
    } catch {
      // ignore
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0];
        if (!box || box.blockSize < 30) return;
        try {
          localStorage.setItem(fullKey, JSON.stringify(Math.round(box.blockSize)));
        } catch {
          // ignore
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [textareaId, fullKey, enabled]);
}

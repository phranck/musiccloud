import { marked } from "marked";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/locales";

export type InfoPanelTab = "about" | "services" | "imprint" | "dsgvo";

export interface InfoPanelContent {
  about: string;
  services: string;
  imprint: string;
  dsgvo: string;
}

interface UseInfoPanelResult {
  isVisible: boolean;
  activeTab: InfoPanelTab;
  setActiveTab: (tab: InfoPanelTab) => void;
  content: InfoPanelContent | null;
  isLoading: boolean;
  contentHeight: number | null;
  tabRefs: React.RefObject<Record<InfoPanelTab, HTMLDivElement | null>>;
  handleClose: () => void;
}

/**
 * Manages all state and side effects for InfoPanel:
 * - Enter/exit animation via `isVisible`
 * - Locale-aware markdown content loading with per-locale cache
 * - Animated tab-switch height
 * - ESC key handling
 */
export function useInfoPanel(
  isOpen: boolean,
  onClose: () => void,
  locale: Locale,
  t: (key: string) => string,
): UseInfoPanelResult {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<InfoPanelTab>("about");
  const [content, setContent] = useState<InfoPanelContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  // Keep a stable ref to `t` so the content-fetch effect doesn't re-run
  // (and abort its fetches) every time translations finish loading.
  const tRef = useRef(t);
  tRef.current = t;

  const contentCacheRef = useRef<Map<Locale, InfoPanelContent>>(new Map());
  const tabRefs = useRef<Record<InfoPanelTab, HTMLDivElement | null>>({
    about: null,
    services: null,
    imprint: null,
    dsgvo: null,
  });

  // Trigger enter animation one frame after mount
  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Animated close: fade+scale out, then unmount
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 380);
  }, [onClose]);

  // Load markdown content when panel opens or locale changes
  useEffect(() => {
    if (!isOpen) return;

    const cached = contentCacheRef.current.get(locale);
    if (cached) {
      setContent(cached);
      return;
    }

    setContent(null);
    setContentHeight(null);
    setIsLoading(true);

    const controller = new AbortController();
    const fetchMd = async (file: string): Promise<string> => {
      const r = await fetch(`/content/${locale}/${file}`, { signal: controller.signal });
      if (r.ok) return r.text();
      const fallback = await fetch(`/content/en/${file}`, { signal: controller.signal });
      return fallback.text();
    };

    let cancelled = false;
    Promise.all([fetchMd("about.md"), fetchMd("services.md"), fetchMd("imprint.md"), fetchMd("privacy.md")])
      .then(async ([aboutMd, servicesMd, imprintMd, privacyMd]) => {
        if (cancelled) return;
        const data: InfoPanelContent = {
          about: await marked(aboutMd),
          services: await marked(servicesMd),
          imprint: await marked(imprintMd),
          dsgvo: await marked(privacyMd),
        };
        contentCacheRef.current.set(locale, data);
        setContent(data);
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error("[InfoPanel] Content load failed:", error);
        const err = `<p>${tRef.current("infopanel.unavailable")}</p>`;
        setContent({ about: err, services: err, imprint: err, dsgvo: err });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `t` is read via tRef.current in the catch branch so it does not need
    // to be in the dep array; including it would abort in-flight fetches
    // every time translations finish loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, locale]);

  // Measure active tab height for smooth tab-switch animation
  useLayoutEffect(() => {
    if (!content) return;
    const ref = tabRefs.current[activeTab];
    if (ref) setContentHeight(ref.scrollHeight);
  }, [activeTab, content]);

  // ESC key – capture phase so it fires before page-level handlers
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, handleClose]);

  return { isVisible, activeTab, setActiveTab, content, isLoading, contentHeight, tabRefs, handleClose };
}

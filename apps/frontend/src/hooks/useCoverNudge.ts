import { type RefObject, useCallback, useEffect, useRef } from "react";
import { ShareMediaView, type ShareMediaView as ShareMediaViewType } from "@/components/share/ShareMediaView.types";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { buildCoverNudgeTimeline, stopCoverNudge } from "@/lib/motion/coverNudge";
import { registerCoverVisit, suppressCoverNudge } from "@/lib/share/cover-nudge-state";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const COVER_STAGE_SELECTOR = "[data-media-stage='cover']";

interface UseCoverNudgeOptions {
  screenRef: RefObject<HTMLElement | null>;
  mediaView: ShareMediaViewType;
  enabled: boolean;
}

/**
 * Owns the cover-discovery visit and animation lifecycle. A turntable view or intentional toggle
 * permanently suppresses the nudge, while StrictMode and effect replays cannot consume a second visit.
 */
export function useCoverNudge({ screenRef, mediaView, enabled }: UseCoverNudgeOptions): () => void {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const timelineRef = useRef<ReturnType<typeof buildCoverNudgeTimeline>>(null);
  const visitRegisteredRef = useRef(false);

  const stop = useCallback(() => {
    timelineRef.current?.kill();
    timelineRef.current = null;
    const stage = screenRef.current?.querySelector<HTMLElement>(COVER_STAGE_SELECTOR);
    if (stage) stopCoverNudge(stage);
  }, [screenRef]);

  const suppress = useCallback(() => {
    stop();
    if (typeof window !== "undefined") suppressCoverNudge(window.localStorage);
  }, [stop]);

  useEffect(() => {
    if (!enabled) return;
    if (
      mediaView === ShareMediaView.Turntable ||
      document.documentElement.dataset.shareMediaView === ShareMediaView.Turntable
    ) {
      suppress();
      return;
    }
    if (reducedMotion || visitRegisteredRef.current) return;

    const stage = screenRef.current?.querySelector<HTMLElement>(COVER_STAGE_SELECTOR);
    if (!stage) return;
    visitRegisteredRef.current = true;
    const shouldNudge = registerCoverVisit({
      storage: window.localStorage,
      coverVisible: true,
      motionAllowed: true,
    });
    if (shouldNudge) timelineRef.current = buildCoverNudgeTimeline(stage);
    return stop;
  }, [enabled, mediaView, reducedMotion, screenRef, stop, suppress]);

  return suppress;
}

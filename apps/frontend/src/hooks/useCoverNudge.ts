import { type RefObject, useCallback, useEffect, useRef } from "react";
import { ShareMediaView, type ShareMediaView as ShareMediaViewType } from "@/components/share/ShareMediaView.types";
import { useCoverNudgeRequest } from "@/context/CoverNudgeContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { buildCoverNudgeTimeline, stopCoverNudge } from "@/lib/motion/coverNudge";
import { REDUCED_MOTION_QUERY } from "@/lib/motion/setup";

const COVER_STAGE_SELECTOR = "[data-media-stage='cover']";

interface UseCoverNudgeOptions {
  screenRef: RefObject<HTMLElement | null>;
  mediaView: ShareMediaViewType;
  enabled: boolean;
}

/**
 * Runs the page owner's nudge request on the currently mounted cover stage. Visit registration stays
 * outside this hook, so hydration and responsive layout changes cannot count or animate twice.
 */
export function useCoverNudge({ screenRef, mediaView, enabled }: UseCoverNudgeOptions): () => void {
  const request = useCoverNudgeRequest();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const timelineRef = useRef<ReturnType<typeof buildCoverNudgeTimeline>>(null);

  const stop = useCallback(() => {
    timelineRef.current?.kill();
    timelineRef.current = null;
    const stage = screenRef.current?.querySelector<HTMLElement>(COVER_STAGE_SELECTOR);
    if (stage) stopCoverNudge(stage);
  }, [screenRef]);

  useEffect(() => {
    if (
      !enabled ||
      !request?.requested ||
      reducedMotion ||
      mediaView === ShareMediaView.Turntable ||
      document.documentElement.dataset.shareMediaView === ShareMediaView.Turntable
    ) {
      stop();
      return;
    }

    const stage = screenRef.current?.querySelector<HTMLElement>(COVER_STAGE_SELECTOR);
    if (!stage) return;
    timelineRef.current = buildCoverNudgeTimeline(stage, request.onComplete);
    return stop;
  }, [enabled, mediaView, reducedMotion, request, screenRef, stop]);

  return stop;
}

import { useCallback, useEffect, useReducer, useRef } from "react";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { ShareMediaView, type ShareMediaView as ShareMediaViewType } from "@/components/share/ShareMediaView.types";
import {
  CoverNudgePhase,
  readCoverNudgeStorage,
  registerCoverVisit,
  suppressCoverNudge,
} from "@/lib/share/cover-nudge-state";

const COVER_NUDGE_DELAY_MS = 2000;

const CoverNudgeActionType = {
  VisitRegistered: "visitRegistered",
  PlaybackIntent: "playbackIntent",
  PlaybackCancelled: "playbackCancelled",
  DelayElapsed: "delayElapsed",
  Finished: "finished",
  Suppressed: "suppressed",
} as const;

type CoverNudgeAction =
  | { type: typeof CoverNudgeActionType.VisitRegistered; shouldArm: boolean }
  | { type: typeof CoverNudgeActionType.PlaybackIntent }
  | { type: typeof CoverNudgeActionType.PlaybackCancelled }
  | { type: typeof CoverNudgeActionType.DelayElapsed }
  | { type: typeof CoverNudgeActionType.Finished }
  | { type: typeof CoverNudgeActionType.Suppressed };

function coverNudgeReducer(phase: CoverNudgePhase, action: CoverNudgeAction): CoverNudgePhase {
  switch (action.type) {
    case CoverNudgeActionType.VisitRegistered:
      return action.shouldArm && phase === CoverNudgePhase.Idle ? CoverNudgePhase.Armed : phase;
    case CoverNudgeActionType.PlaybackIntent:
      return phase === CoverNudgePhase.Armed ? CoverNudgePhase.Delay : phase;
    case CoverNudgeActionType.PlaybackCancelled:
      return phase === CoverNudgePhase.Delay ? CoverNudgePhase.Armed : phase;
    case CoverNudgeActionType.DelayElapsed:
      return phase === CoverNudgePhase.Delay ? CoverNudgePhase.Requested : phase;
    case CoverNudgeActionType.Finished:
      return phase === CoverNudgePhase.Requested ? CoverNudgePhase.Done : phase;
    case CoverNudgeActionType.Suppressed:
      return phase === CoverNudgePhase.Done ? phase : CoverNudgePhase.Done;
  }
}

interface UseCoverNudgeControllerOptions {
  reducedMotion: boolean;
  shareMediaView: ShareMediaViewType;
}

/** Owns one share-page visit's nudge eligibility, playback delay, animation request, and suppression. */
export function useCoverNudgeController({ reducedMotion, shareMediaView }: UseCoverNudgeControllerOptions) {
  const [phase, dispatch] = useReducer(coverNudgeReducer, CoverNudgePhase.Idle);
  const visitRegistered = useRef(false);

  useEffect(() => {
    if (
      visitRegistered.current ||
      reducedMotion ||
      shareMediaView !== ShareMediaView.Cover ||
      document.documentElement.dataset.shareMediaView === ShareMediaView.Turntable
    ) {
      return;
    }
    const storage = readCoverNudgeStorage();
    if (!storage) return;
    visitRegistered.current = true;
    const shouldArm = registerCoverVisit({ storage, coverVisible: true, motionAllowed: true });
    dispatch({ type: CoverNudgeActionType.VisitRegistered, shouldArm });
  }, [reducedMotion, shareMediaView]);

  useEffect(() => {
    if (phase !== CoverNudgePhase.Delay || reducedMotion || shareMediaView !== ShareMediaView.Cover) return;
    const timeout = window.setTimeout(
      () => dispatch({ type: CoverNudgeActionType.DelayElapsed }),
      COVER_NUDGE_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [phase, reducedMotion, shareMediaView]);

  const onUserPlaybackIntent = useCallback(() => dispatch({ type: CoverNudgeActionType.PlaybackIntent }), []);
  const onPlaybackStatusChange = useCallback((status: AudioStatus | null) => {
    if (
      status === null ||
      status === AudioStatus.Ready ||
      status === AudioStatus.Paused ||
      status === AudioStatus.Ended ||
      status === AudioStatus.Unavailable
    ) {
      dispatch({ type: CoverNudgeActionType.PlaybackCancelled });
    }
  }, []);
  const onComplete = useCallback(() => dispatch({ type: CoverNudgeActionType.Finished }), []);
  const suppress = useCallback(() => {
    dispatch({ type: CoverNudgeActionType.Suppressed });
    const storage = readCoverNudgeStorage();
    if (storage) suppressCoverNudge(storage);
  }, []);

  return {
    requested: phase === CoverNudgePhase.Requested,
    onUserPlaybackIntent,
    onPlaybackStatusChange,
    onComplete,
    suppress,
  };
}

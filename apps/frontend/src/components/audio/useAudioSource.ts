/**
 * The player's audio source: the `<audio>` element built for each effective
 * URL, its media event wiring, the switch between sources on a mounted player,
 * and the fade-out and graph teardown of the element it replaces.
 */
import { type ActionDispatch, type RefObject, useEffect, useEffectEvent, useRef } from "react";
import { AudioStatus, type AudioStatus as AudioStatusType } from "@/components/audio/AudioStatus";
import { fadeOutForTeardown } from "@/components/audio/audioFades";
import { disconnectAudioGraph } from "@/components/audio/audioGraph";
import {
  AudioContextState,
  type PlayerAction,
  PlayerActionType,
  resolveAudioDuration,
  resolveAudioProgressRatio,
} from "@/components/audio/playerStateMachine";
import type { AudioGraph } from "@/components/audio/useAudioGraph";
import type { PlaybackProgress } from "@/components/audio/usePlaybackProgress";
import type { PlaybackTransport } from "@/components/audio/usePlaybackTransport";
import type { SpectrumLoop } from "@/components/audio/useSpectrumLoop";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { prefersReducedMotion } from "@/lib/motion/setup";

/**
 * What the source effect reads and drives. The graph, loop, progress and
 * transport callbacks are the ones `useAudioGraph`, `useSpectrumLoop`,
 * `usePlaybackProgress` and `usePlaybackTransport` return, documented there.
 */
export interface AudioSourceOptions
  extends Pick<AudioGraph, "audioContextRef" | "releaseAudioGraph" | "teardownSpectrum">,
    Pick<SpectrumLoop, "analysersRef" | "stopSpectrumLoop" | "startSpectrumFadeOut">,
    Pick<PlaybackProgress, "setProgressRatioValue" | "startProgressRewind" | "stopProgressLoop" | "stopProgressRewind">,
    Pick<PlaybackTransport, "beginPlayback"> {
  /** The URL to play. Null while the preview URL is still being fetched, which mounts no element. */
  effectiveUrl: string | null;
  /** The record identity at mount, the first baseline a source switch compares against. */
  initialSwapKey: string | undefined;
  /** The player reducer's dispatch. */
  dispatch: ActionDispatch<[action: PlayerAction]>;
  /** The current audio element, which this hook sets for each source and clears on cleanup. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Mirrors whether playback is active, read on a switch to decide whether to continue. */
  isPlayingRef: RefObject<boolean>;
  /** Mirrors the current record identity, read on each switch. */
  recordSwapKeyRef: RefObject<string | undefined>;
  /** Reports a status change to the host. */
  notifyStatusChange: (status: AudioStatusType) => void;
}

/**
 * Owns the audio element of one player. The effect reruns only when
 * `effectiveUrl` or one of the stable callbacks it lists changes, because every
 * ref and `dispatch` in its dependency list keeps its identity.
 *
 * @param options - {@link AudioSourceOptions}.
 */
export function useAudioSource({
  effectiveUrl,
  initialSwapKey,
  dispatch,
  audioRef,
  isPlayingRef,
  recordSwapKeyRef,
  audioContextRef,
  releaseAudioGraph,
  teardownSpectrum,
  analysersRef,
  stopSpectrumLoop,
  startSpectrumFadeOut,
  setProgressRatioValue,
  startProgressRewind,
  stopProgressLoop,
  stopProgressRewind,
  beginPlayback,
  notifyStatusChange,
}: AudioSourceOptions): void {
  // True while a source SWITCH is in flight (a new source effect has mounted), so
  // the previous cleanup's deferred teardown keeps the AudioContext warm instead of
  // closing it. Only a real unmount (no following source effect) leaves it false and
  // closes the context. See the source effect + finishTeardown.
  const switchPendingRef = useRef(false);
  // True once the source effect has mounted a source, so a later run is a switch.
  // `hasStartedRef` turns true only on a first play, and a track that failed to
  // load or was never played still leaves its phase behind for the next track.
  const hasMountedSourceRef = useRef(false);
  // The record identity applied at the last source switch. It is the baseline the
  // next switch compares against to tell a same-album track change from a record swap.
  const lastSwapKeyRef = useRef(initialSwapKey);

  const setProgressRatioFromEvent = useEffectEvent(setProgressRatioValue);
  const startProgressRewindFromEvent = useEffectEvent(startProgressRewind);
  const startSpectrumFadeOutFromEvent = useEffectEvent(startSpectrumFadeOut);
  const notifyStatusChangeFromEvent = useEffectEvent(notifyStatusChange);

  // Decides how a source switch (a previewUrl change on the mounted hub) proceeds.
  // A same-album track change, a missing swap identity or reduced motion continues
  // playback seamlessly on the fresh element. A record swap to a different album
  // instead hands playback to the swap orchestration: it reports Ready so the deck
  // coasts to a halt and leaves the new element idle until the disc has settled and
  // the deck re-triggers play. `previousSwapKey` is the identity at the prior
  // switch (captured before the ref is advanced), so it is never the incoming one.
  const applySourceSwitch = useEffectEvent((audio: HTMLAudioElement, previousSwapKey: string | undefined) => {
    dispatch({ type: PlayerActionType.SourceChanged });
    setProgressRatioValue(0);
    if (!isPlayingRef.current) return;
    const currentSwapKey = recordSwapKeyRef.current;
    const isRecordSwap = currentSwapKey !== undefined && currentSwapKey !== previousSwapKey && !prefersReducedMotion();
    if (isRecordSwap) {
      notifyStatusChange(AudioStatus.Ready);
      return;
    }
    beginPlayback(audio);
  });

  // The audio element is (re)created whenever the effective URL changes. Both a
  // same-album track switch and a different-album record swap change the URL on the
  // mounted hub (the hub no longer remounts per track, MC-113); the element is
  // rebuilt for the new source, and `applySourceSwitch` decides whether to continue
  // playback on the new element (same album) or defer it to the swap orchestration
  // (different album). Playback-state transitions (play/pause) do NOT re-run this.
  // Only the URL does, so a running play() is never torn down mid-promise. The
  // cleanup fades the old element out then disconnects it, but KEEPS the
  // AudioContext warm across the switch (only an unmount closes it): a fresh context
  // cannot be resumed without a user gesture, which the record swap's coast + slide
  // (about 3s) outlives. That was the exact cause of the new track running silently
  // with a dark analyzer after the swap. Reusing the still-running context needs no resume.
  useEffect(() => {
    if (!effectiveUrl) return;

    // A new source is mounting: mark this as a switch so the PREVIOUS cleanup's
    // deferred teardown keeps the context warm instead of closing it.
    switchPendingRef.current = true;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.muted = false;
    audio.volume = 1;
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.MetadataLoaded, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.TimeUpdate, currentTime: audio.currentTime, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setProgressRatioFromEvent(1);
      startProgressRewindFromEvent();
      startSpectrumFadeOutFromEvent();
      sendMusicSignal(PreviewSignal.Finished);
      notifyStatusChangeFromEvent(AudioStatus.Ready);
      dispatch({ type: PlayerActionType.Ended });
    };
    const handleError = () => {
      stopProgressLoop();
      sendMusicSignal(PreviewSignal.Error);
      notifyStatusChangeFromEvent(AudioStatus.Unavailable);
      dispatch({ type: PlayerActionType.Error });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    // Advance the record-swap baseline for every source change (including idle
    // adopts and the initial mount) so it never goes stale, capturing the prior
    // identity first for the switch decision.
    const previousSwapKey = lastSwapKeyRef.current;
    lastSwapKeyRef.current = recordSwapKeyRef.current;

    // A source switch (not the first source): reset the player to a fresh idle
    // track, whatever phase the previous one ended in, and either continue or
    // defer playback per the swap decision.
    if (hasMountedSourceRef.current) {
      applySourceSwitch(audio, previousSwapKey);
    }
    hasMountedSourceRef.current = true;

    return () => {
      // Reset the switch flag; a FOLLOWING source effect (a real switch) sets it
      // back to true before the deferred teardown below reads it. On unmount no such
      // effect runs, so it stays false and the context is closed.
      switchPendingRef.current = false;

      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopProgressLoop();
      stopProgressRewind();
      audioRef.current = null;
      // Released synchronously, so a following source effect that continues playback
      // builds a graph for its own element instead of reusing this one.
      const previousGraph = releaseAudioGraph();

      // Pauses + clears the old element. Kept synchronous (or on the fade timer) so
      // it never leaks past a later render tick.
      const detachOldElement = () => {
        audio.pause();
        audio.src = "";
      };
      // Disconnects the old element's graph. On a switch the AudioContext stays warm
      // for the next track, and the spectrum loop is stopped only when the next track
      // has not built a graph yet, because otherwise the running loop is already its
      // own. On a real unmount the full teardown closes the context. Deferred so a
      // following source effect can flip `switchPendingRef` to true first, but
      // pause-free so the deferral cannot inflate teardown pauses.
      const finalizeGraph = () => {
        disconnectAudioGraph(previousGraph);
        if (switchPendingRef.current) {
          if (!analysersRef.current) stopSpectrumLoop();
          return;
        }
        teardownSpectrum();
      };

      const audioContext = audioContextRef.current;
      const gainNode = previousGraph.gain;
      const canFade =
        audioContext !== null &&
        audioContext.state === AudioContextState.Running &&
        gainNode !== null &&
        !audio.paused &&
        !audio.ended;

      if (canFade) {
        fadeOutForTeardown(gainNode, audioContext, () => {
          detachOldElement();
          finalizeGraph();
        });
        return;
      }

      // Not playing: detach synchronously (nothing to fade), but defer the decision
      // between a switch and an unmount so a synchronous following source effect can
      // flag the switch first.
      detachOldElement();
      window.setTimeout(finalizeGraph, 0);
    };
  }, [
    effectiveUrl,
    stopProgressLoop,
    stopProgressRewind,
    stopSpectrumLoop,
    releaseAudioGraph,
    teardownSpectrum,
    analysersRef,
    audioContextRef,
    audioRef,
    dispatch,
    recordSwapKeyRef,
  ]);
}

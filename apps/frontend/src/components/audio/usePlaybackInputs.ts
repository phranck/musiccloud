/**
 * The inputs outside the player's own controls: the operating system's media
 * session and the tab-wide keyboard router.
 */
import { useEffect, useEffectEvent, useRef } from "react";
import { registerAudioForKeyboard } from "@/components/audio/audioKeyboardRegistry";
import {
  MediaSessionAction,
  MediaSessionPlaybackState,
  PlayerPhase,
  type PlayerState,
} from "@/components/audio/playerStateMachine";
import type { PlaybackTransport } from "@/components/audio/usePlaybackTransport";

/**
 * What the inputs read and trigger. The transport callbacks are the ones
 * `usePlaybackTransport` returns, documented there.
 */
export interface PlaybackInputsOptions
  extends Pick<PlaybackTransport, "togglePlay" | "seekBy" | "seekToStart" | "seekToNearEnd"> {
  /** The player's current phase. The media session is claimed only while playing or paused. */
  phase: PlayerState["phase"];
  /** The title shown in the operating system's now playing display. */
  trackTitle: string;
  /** While true, the spacebar and the media keys do nothing, as the play button is disabled. */
  playbackLocked: boolean;
}

/**
 * Connects one player to the media session and the keyboard router. Its three
 * effects run in this order: the media session, the active-state mirror, and
 * the keyboard registration.
 *
 * @param options - {@link PlaybackInputsOptions}.
 */
export function usePlaybackInputs({
  phase,
  trackTitle,
  playbackLocked,
  togglePlay,
  seekBy,
  seekToStart,
  seekToNearEnd,
}: PlaybackInputsOptions): void {
  // The spacebar and the media keys are input like the play button, so they
  // respect the lock the button shows; reading the prop here keeps it current
  // for the long-lived listeners without re-registering them.
  const togglePlayFromInput = useEffectEvent(() => {
    if (!playbackLocked) togglePlay();
  });

  const seekByFromEvent = useEffectEvent(seekBy);
  const seekToStartFromEvent = useEffectEvent(seekToStart);
  const seekToNearEndFromEvent = useEffectEvent(seekToNearEnd);

  /**
   * Wires up the global MediaSession so the OS can route Media Keys, Bluetooth
   * headset buttons, macOS Touch-Bar / Now-Playing controls and similar
   * transport inputs to the preview player while the tab is the active media
   * source.
   *
   * Only registered while the player is in `Playing` or `Paused` phase: in
   * `Loading`, `Error`, `Unavailable` and `Idle` there is no audio to control
   * yet, so claiming the OS media slot would be misleading. On cleanup the
   * action handlers, metadata and `playbackState` are cleared so the Now-
   * Playing UI does not show a stale entry once the preview is gone.
   *
   * Multiple parallel `AudioPlayer` instances on the same page share
   * the single tab-wide MediaSession: whichever player most recently entered
   * Playing/Paused owns the OS controls. That matches user intuition (the
   * media key controls the preview you last interacted with) and avoids
   * extra coordination machinery.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (phase !== PlayerPhase.Playing && phase !== PlayerPhase.Paused) return;

    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new window.MediaMetadata({ title: trackTitle });
    mediaSession.playbackState =
      phase === PlayerPhase.Playing ? MediaSessionPlaybackState.Playing : MediaSessionPlaybackState.Paused;

    const handler = () => togglePlayFromInput();
    try {
      mediaSession.setActionHandler(MediaSessionAction.Play, handler);
      mediaSession.setActionHandler(MediaSessionAction.Pause, handler);
    } catch {
      // Older browsers throw on unsupported actions. Whatever did register
      // stays active until cleanup runs.
    }

    return () => {
      try {
        mediaSession.setActionHandler(MediaSessionAction.Play, null);
        mediaSession.setActionHandler(MediaSessionAction.Pause, null);
      } catch {
        // Ignored for the reason given above.
      }
      mediaSession.metadata = null;
      mediaSession.playbackState = MediaSessionPlaybackState.None;
    };
  }, [phase, trackTitle]);

  const isPlayerActive = phase === PlayerPhase.Playing || phase === PlayerPhase.Paused;
  const isPlayerActiveRef = useRef(isPlayerActive);
  useEffect(() => {
    isPlayerActiveRef.current = isPlayerActive;
  }, [isPlayerActive]);

  /**
   * Registers this player with the tab-wide keyboard router so the global
   * keydown listener can start, toggle, or seek playback without a player
   * control being focused. Resolves the autoplay-policy gap left by
   * MediaSession: the OS media keys can only take over once playback has
   * started at least once, whereas spacebar/arrow keys in the focused tab
   * count as real user gestures and are therefore allowed to kick off the
   * very first play.
   */
  useEffect(() => {
    return registerAudioForKeyboard({
      togglePlay: () => togglePlayFromInput(),
      isActive: () => isPlayerActiveRef.current,
      seekBy: (delta) => seekByFromEvent(delta),
      seekToStart: () => seekToStartFromEvent(),
      seekToNearEnd: () => seekToNearEndFromEvent(),
    });
  }, []);
}

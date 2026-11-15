import { useCallback } from "react";
import { Player } from "@/components/playback/Player";
import { useTurntablePlayer, useTurntableProgress } from "@/components/turntable/TurntablePlayerContext";

/**
 * The transport "remote" of the turntable hub: the play/pause button and the
 * analyzer/progress VFD, driven from the {@link useTurntablePlayer} hub instead
 * of from the engine directly.
 *
 * Reuses the existing {@link Player} compound (same button + analyzer look) but
 * feeds it the hub's view-model, so the optic is identical to the former
 * `AudioPlayer` render while the playback source is now the shared hub. Must be
 * rendered inside a `TurntablePlayerProvider`.
 */
interface TurntableAnalyzerSlotProps {
  /** Reports an actual play-button start, excluding pauses and deck-driven restarts. */
  onUserPlaybackIntent?: () => void;
}

export function TurntableAnalyzerSlot({ onUserPlaybackIntent }: TurntableAnalyzerSlotProps) {
  const hub = useTurntablePlayer();
  const handleTogglePlay = useCallback(() => {
    if (!hub.isPlaying) onUserPlaybackIntent?.();
    hub.togglePlay();
  }, [hub.isPlaying, hub.togglePlay, onUserPlaybackIntent]);
  // Progress comes from its own context: it updates ~60×/s, and subscribing to
  // it here (rather than via the main hub value) keeps that churn from
  // re-rendering the LED/platter/knob, which read only the stable hub value.
  const progressRatio = useTurntableProgress();

  return (
    <section aria-label={`${hub.mediaLabel}: ${hub.trackTitle}`}>
      <Player
        isPlaying={hub.isPlaying}
        isDisabled={hub.isDisabled}
        isPlaybackLocked={hub.isPlaybackLocked}
        timeText={hub.timeText}
        progressRatio={progressRatio}
        ariaLabel={hub.ariaLabel}
        title={hub.title}
        onTogglePlay={handleTogglePlay}
      />
    </section>
  );
}

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
export function TurntableAnalyzerSlot() {
  const hub = useTurntablePlayer();
  // Progress comes from its own context: it updates ~60×/s, and subscribing to
  // it here (rather than via the main hub value) keeps that churn from
  // re-rendering the LED/platter/knob, which read only the stable hub value.
  const progressRatio = useTurntableProgress();

  return (
    <section aria-label={`${hub.mediaLabel}: ${hub.trackTitle}`}>
      <Player
        isPlaying={hub.isPlaying}
        isDisabled={hub.isDisabled}
        timeText={hub.timeText}
        progressRatio={progressRatio}
        ariaLabel={hub.ariaLabel}
        title={hub.title}
        onTogglePlay={hub.togglePlay}
      />
    </section>
  );
}

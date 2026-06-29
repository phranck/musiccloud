import { Player } from "@/components/playback/Player";
import { useTurntablePlayer } from "@/components/turntable/TurntablePlayerContext";

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

  return (
    <section aria-label={`${hub.mediaLabel}: ${hub.trackTitle}`}>
      <Player
        isPlaying={hub.isPlaying}
        isDisabled={hub.isDisabled}
        timeText={hub.timeText}
        progressRatio={hub.progressRatio}
        ariaLabel={hub.ariaLabel}
        title={hub.title}
        onTogglePlay={hub.togglePlay}
      />
    </section>
  );
}

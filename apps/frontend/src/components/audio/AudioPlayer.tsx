import { type AudioPlayerProps, useAudioController } from "@/components/audio/useAudioController";
import { Player } from "@/components/playback/Player";

export { type AudioPlayerProps, useAudioController } from "@/components/audio/useAudioController";

/**
 * AudioPlayer - Audio preview playback component
 *
 * Orchestrates the compound Player component for audio preview functionality.
 * Handles audio element lifecycle and state management through
 * {@link useAudioController}, whose phases `playerStateMachine` defines.
 *
 * @param props - {@link AudioPlayerProps}.
 */
export function AudioPlayer(props: AudioPlayerProps) {
  const player = useAudioController(props);

  return (
    <section aria-label={`${player.mediaLabel}: ${player.trackTitle}`}>
      <Player
        isPlaying={player.isPlaying}
        isDisabled={player.isDisabled}
        isPlaybackLocked={player.isPlaybackLocked}
        timeText={player.timeText}
        progressRatio={player.progressRatio}
        ariaLabel={player.ariaLabel}
        title={player.title}
        onTogglePlay={player.togglePlay}
      />
    </section>
  );
}

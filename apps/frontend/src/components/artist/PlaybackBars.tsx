import { cn } from "@/lib/utils";

interface PlaybackBarsProps {
  /** Placement within the row's trailing slot. */
  className?: string;
}

/**
 * The small bar indicator that tells a track row its track is the one playing.
 * Decorative: it shows no audio data, and the row announces its state through
 * `aria-current`.
 *
 * Every row renders it, hidden. The row's `data-playback` attribute shows it and
 * drives the bars from the stylesheet (`.mc-playback-bars` in
 * `styles/animations.css`), so a state change fades on the element already on
 * screen instead of mounting a new one.
 *
 * @param props - {@link PlaybackBarsProps}.
 */
export function PlaybackBars({ className }: PlaybackBarsProps) {
  return (
    <span aria-hidden="true" className={cn("mc-playback-bars", className)}>
      <span className="mc-playback-bar" />
      <span className="mc-playback-bar" />
      <span className="mc-playback-bar" />
      <span className="mc-playback-bar" />
    </span>
  );
}

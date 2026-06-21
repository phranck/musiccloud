interface SkeletonRowProps {
  /**
   * Render the leading artwork box. Tracks/similar rows have artwork; event
   * rows do not.
   *
   * @defaultValue `true`
   */
  leading?: boolean;
}

/**
 * One loading-placeholder row mirroring an artist-panel row's geometry: an
 * optional leading artwork box, a two-line text column, and a trailing box. The
 * shared building block for the track/event/similar skeletons so the
 * placeholder row markup lives in one place. Uses `--mc-gap-rowitem` so the
 * shimmer tracks the same horizontal rhythm as the real rows.
 */
export function SkeletonRow({ leading = true }: SkeletonRowProps) {
  return (
    <div className="flex items-center gap-[var(--mc-gap-rowitem,0.75rem)]">
      {leading && <div className="size-12 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />}
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-white/[0.08] rounded w-4/5" />
        <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
      </div>
      <div className="h-7 w-16 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
    </div>
  );
}

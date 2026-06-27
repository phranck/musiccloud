import { cn } from "@/lib/utils";

/**
 * Crossfade between a skeleton placeholder and the real content.
 * Uses CSS grid overlap + opacity transitions for a smooth effect.
 */
export function CrossFade({
  contentReady,
  skeleton,
  content,
}: {
  contentReady: boolean;
  skeleton: React.ReactNode;
  content: React.ReactNode | null;
}) {
  return (
    <div className="grid">
      <div
        aria-hidden="true"
        className={cn(
          // Animate opacity only (GPU), matching the content layer below. The
          // `h-0` collapse snaps instantly but stays invisible: the real content
          // shares this grid cell and holds the row height, so animating the
          // skeleton's height would only add main-thread layout work for nothing.
          "col-start-1 row-start-1 transition-opacity duration-300",
          contentReady ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100",
        )}
      >
        {skeleton}
      </div>
      {content && (
        <div
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-300",
            contentReady ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

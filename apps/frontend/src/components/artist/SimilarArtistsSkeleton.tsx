import { SkeletonRow } from "@/components/artist/SkeletonRow";
import { SKELETON_ROW_KEYS } from "@/components/artist/skeletonRowKeys";

/**
 * Loading placeholder for the similar-artists list: three groups, each a short
 * artist-name bar above an artwork row.
 */
export function SimilarArtistsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {SKELETON_ROW_KEYS.map((k) => (
        <div key={k}>
          <div className="h-3 bg-white/[0.08] rounded w-1/4 mb-2" />
          <SkeletonRow />
        </div>
      ))}
    </div>
  );
}

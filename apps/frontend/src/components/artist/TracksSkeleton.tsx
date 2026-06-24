import { SkeletonRow } from "@/components/artist/SkeletonRow";
import { SKELETON_ROW_KEYS } from "@/components/artist/skeletonRowKeys";

/** Loading placeholder for the popular-tracks list: three artwork rows. */
export function TracksSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {SKELETON_ROW_KEYS.map((k) => (
        <SkeletonRow key={k} />
      ))}
    </div>
  );
}

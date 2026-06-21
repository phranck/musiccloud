import { SkeletonRow } from "@/components/artist/SkeletonRow";
import { SKELETON_ROW_KEYS } from "@/components/artist/skeletonRowKeys";

/** Loading placeholder for the events list: two artwork-less rows. */
export function EventsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {SKELETON_ROW_KEYS.slice(0, 2).map((k) => (
        <SkeletonRow key={k} leading={false} />
      ))}
    </div>
  );
}

import { type ReactNode, useEffect, useReducer } from "react";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import {
  sectionCardFooterClassName,
  sectionCardFooterTextClassName,
  sectionCardHeaderClassName,
  sectionCardTitleClassName,
} from "@/components/cards/sectionCardChromeStyles";

export type ArtistInfoStatus = "loading" | "ready" | "empty" | "error";

/** Grace window after mount during which loading skeletons stay suppressed. */
const SKELETON_DELAY_MS = 300;

/**
 * Skeleton render gate: suppresses the loading skeleton for the first
 * {@link SKELETON_DELAY_MS} after mount, so a fast/null fetch (cache hit, 5xx)
 * never produces the "empty card flashes in then disappears" effect. If the
 * fetch is still pending past the threshold, the skeleton appears as before.
 *
 * @returns `true` once the grace window has elapsed and skeletons may render.
 */
export function useSkeletonAllowed() {
  const [skeletonAllowed, allowSkeleton] = useReducer(() => true, false);
  useEffect(() => {
    const timer = setTimeout(allowSkeleton, SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return skeletonAllowed;
}

interface ArtistCardShellProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  title?: ReactNode;
}

export function ArtistCardShell({ children, className, footer, title }: ArtistCardShellProps) {
  return (
    <EmbossedCard className={className ?? fullWidthEmbossedCardClassName}>
      {title && (
        <EmbossedCard.Header className={sectionCardHeaderClassName}>
          <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{title}</EmbossedCard.Header.Title>
        </EmbossedCard.Header>
      )}
      {title || footer ? <EmbossedCard.Body>{children}</EmbossedCard.Body> : children}
      {footer && (
        <EmbossedCard.Footer className={sectionCardFooterClassName}>
          <p className={sectionCardFooterTextClassName}>{footer}</p>
        </EmbossedCard.Footer>
      )}
    </EmbossedCard>
  );
}

export function ArtistNoticeContent({ message }: { message: string }) {
  return <p className="text-sm text-text-secondary text-center">{message}</p>;
}

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex gap-4">
        <div className="size-24 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex gap-1.5 flex-wrap">
            <div className="h-5 w-14 rounded-full bg-white/[0.08]" />
            <div className="h-5 w-10 rounded-full bg-white/[0.08]" />
          </div>
          <div className="h-3 bg-white/[0.08] rounded w-3/4" />
          <div className="h-3 bg-white/[0.08] rounded w-1/2" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-3 bg-white/[0.08] rounded w-full" />
        <div className="h-3 bg-white/[0.08] rounded w-[90%]" />
        <div className="h-3 bg-white/[0.08] rounded w-4/5" />
      </div>
    </div>
  );
}

export function TracksSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
        <div key={k} className="flex gap-3 items-center">
          <div className="size-12 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-white/[0.08] rounded w-4/5" />
            <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
          </div>
          <div className="h-7 w-16 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        </div>
      ))}
    </div>
  );
}

export function EventsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {(["sk-a", "sk-b"] as const).map((k) => (
        <div key={k} className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-white/[0.08] rounded w-16" />
            <div className="h-4 bg-white/[0.08] rounded w-3/4" />
          </div>
          <div className="h-7 w-20 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
        </div>
      ))}
    </div>
  );
}

export function SimilarArtistsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {(["sk-a", "sk-b", "sk-c"] as const).map((k) => (
        <div key={k}>
          <div className="h-3 bg-white/[0.08] rounded w-1/4 mb-2" />
          <div className="flex gap-3 items-center">
            <div className="size-12 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.08] rounded w-4/5" />
              <div className="h-2.5 bg-white/[0.08] rounded w-3/5" />
            </div>
            <div className="h-7 w-16 rounded-[4px] sm:rounded-lg bg-white/[0.08] flex-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

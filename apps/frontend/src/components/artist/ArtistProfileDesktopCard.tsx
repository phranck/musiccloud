import type { ArtistInfoResponse } from "@musiccloud/shared";
import { ArtistCardShell } from "@/components/artist/ArtistCardShell";
import { ArtistNoticeWell } from "@/components/artist/ArtistNoticeWell";
import { ArtistProfileCard } from "@/components/artist/ArtistProfileCard";
import type { ArtistInfoStatus } from "@/components/artist/artistPanelTypes";
import { useSkeletonAllowed } from "@/hooks/useSkeletonAllowed";
import { useT } from "@/i18n/localeContext";

interface ArtistProfileDesktopCardProps {
  /** Card title, supplied by the presentation owner (never hardcoded here). */
  title: string;
  /** Credit footer naming the profile data source (supplied from outside). */
  providedBy: string;
  data: ArtistInfoResponse | null;
  isLoading: boolean;
  status?: ArtistInfoStatus;
}

/**
 * Desktop artist-info card: the artist's profile (image, genres, bio). Self-hides
 * on an empty profile; shows a notice on an error. Keeps `useT` for the error
 * message and the "provided by" footer credit — both content, not the title.
 */
export function ArtistProfileDesktopCard({
  title,
  providedBy,
  data,
  isLoading,
  status,
}: ArtistProfileDesktopCardProps) {
  const t = useT();
  const skeletonAllowed = useSkeletonAllowed();
  const effectiveStatus: ArtistInfoStatus = status ?? (isLoading ? "loading" : data ? "ready" : "empty");

  if (isLoading && !data && !skeletonAllowed) {
    return (
      <ArtistCardShell title={title}>
        <div className="min-h-[132px]" aria-hidden="true" />
      </ArtistCardShell>
    );
  }

  if (!isLoading && (!data || !data.profile)) {
    // No profile data: an error still surfaces a notice, but a clean empty
    // profile (e.g. a CC artist without Jamendo musicinfo) self-hides so the
    // column shows only its populated cards, matching the
    // PopularTracks/Events/SimilarArtists self-hide behaviour.
    if (effectiveStatus !== "error") return null;
    return (
      <ArtistCardShell title={title}>
        <div className="px-3 pt-0 pb-3">
          <ArtistNoticeWell message={t("artist.error")} />
        </div>
      </ArtistCardShell>
    );
  }

  const showInitialSkeleton = isLoading && !data;
  const footer = !showInitialSkeleton && data?.profile ? providedBy : undefined;

  return (
    <ArtistCardShell title={title} footer={footer}>
      <div className={footer ? "px-3 pt-0 pb-2" : "px-3 pt-0 pb-3"}>
        <ArtistProfileCard profile={data?.profile} showInitialSkeleton={showInitialSkeleton} />
      </div>
    </ArtistCardShell>
  );
}

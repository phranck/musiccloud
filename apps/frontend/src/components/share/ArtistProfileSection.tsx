import type { ArtistProfile } from "@musiccloud/shared";
import { RecessedCard } from "@/components/cards/RecessedCard";

interface ArtistProfileSectionProps {
  profile: ArtistProfile;
  t: (key: string) => string;
}

export function ArtistProfileSection({ profile, t }: ArtistProfileSectionProps) {
  return (
    <>
      <div className="flex gap-4 min-h-24">
        {profile.imageUrl && (
          <RecessedCard
            className="p-0 w-24 h-24 flex-none relative overflow-hidden"
            radius={{ base: "4px", sm: "8px" }}
            borderWidth="2px"
          >
            <RecessedCard.Body className="contents">
              <img
                src={profile.imageUrl}
                alt=""
                width={96}
                height={96}
                decoding="async"
                className="w-full h-full object-cover"
                style={{ borderRadius: "var(--neu-radius-inner)" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Inner shadow overlay: same visual deboss feel as the
                  PlaybackButton's iconInnerShadow filter, but implemented
                  with box-shadow: inset since raster images have no alpha
                  edges for the SVG filter to hook into.
                  Uses --neu-radius-inner (outer radius minus border width)
                  so the inset-shadow curvature matches the inner edge of
                  the gradient border — `rounded-[inherit]` would round at
                  the OUTER radius and leave a slight mismatch. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: "var(--neu-radius-inner)",
                  boxShadow: "inset 4px 4px 12px rgba(0,0,0,0.9)",
                }}
              />
            </RecessedCard.Body>
          </RecessedCard>
        )}
        <div className="min-w-0 flex-1">
          {profile.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.genres.map((g) => (
                <span
                  key={g}
                  className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-text-secondary capitalize"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-text-secondary">
            {profile.followers != null && (
              <>
                {formatCount(profile.followers)} {t("artist.spotifyFollowers")}
              </>
            )}
            {profile.scrobbles != null && ` \u00B7 ${formatCount(profile.scrobbles)} ${t("artist.lastfmPlays")}`}
          </p>
          {profile.similarArtists.length > 0 && (
            <p className="text-sm text-text-secondary mt-1">
              {t("artist.similar")}: {profile.similarArtists.join(" \u00B7 ")}
            </p>
          )}
        </div>
      </div>
      {profile.bioSummary && (
        <p className="text-base text-text-secondary leading-relaxed mt-3 px-[5px]">{profile.bioSummary}</p>
      )}
    </>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

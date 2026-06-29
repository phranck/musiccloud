import type { ArtistProfile } from "@musiccloud/shared";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { TftScreen } from "@/components/ui/TftScreen";
import { formatCount } from "@/lib/format/count";
import { linkify } from "@/lib/linkify";
import { cn } from "@/lib/utils";

interface ArtistProfileSectionProps {
  profile: ArtistProfile;
  t: (key: string) => string;
}

/** Prose styling for the bio's `<p>`/`<br>` markup rendered via {@link MarkdownHtml}. */
const BIO_PROSE_CLASS =
  "[&_p]:mc-txt-recessed-normal [&_p]:text-base [&_p]:text-text-secondary [&_p]:leading-relaxed [&_p:not(:first-child)]:mt-2";

/** Whether a bio string carries HTML markup (CC bios) vs. plain text (commercial). */
function looksLikeHtml(value: string): boolean {
  return /<\w+[^>]*>/.test(value);
}

export function ArtistProfileSection({ profile, t }: ArtistProfileSectionProps) {
  const hasStats = profile.followers != null || profile.scrobbles != null;

  return (
    <div>
      {/* The artwork floats so the genres, stats and bio wrap around it. */}
      {profile.imageUrl && (
        <RecessedCard
          className="float-left mr-[var(--mc-gap-artist,1rem)] mb-2 p-0 size-24 relative overflow-hidden"
          radius={{ base: "4px", sm: "8px" }}
          borderWidth="2px"
        >
          <RecessedCard.Body className="contents">
            {/* The artist thumbnail is a plain recessed image: the cover plus the
                inset frame shadow, deliberately without the LCD tint/grid/sheen
                so the photo reads naturally. */}
            <TftScreen className="size-full">
              <TftScreen.Cover image={profile.imageUrl} alt="" />
              <TftScreen.Shadow />
            </TftScreen>
          </RecessedCard.Body>
        </RecessedCard>
      )}

      {profile.genres.length > 0 && (
        <div className="mb-2">
          {profile.genres.map((g) => (
            <span
              key={g}
              className="mc-txt-recessed-dimmed mr-1.5 mb-1.5 inline-block rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-xs text-text-secondary capitalize"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {hasStats && (
        <p className="mc-txt-recessed-normal text-sm text-text-secondary">
          {profile.followers != null && (
            <>
              {formatCount(profile.followers)} {t("artist.fanCount")}
            </>
          )}
          {profile.scrobbles != null && ` · ${formatCount(profile.scrobbles)} ${t("artist.lastfmPlays")}`}
        </p>
      )}

      {profile.similarArtists.length > 0 && (
        <p className="mc-txt-recessed-normal text-sm text-text-secondary mt-1">
          {t("artist.similar")}: {profile.similarArtists.join(" · ")}
        </p>
      )}

      {profile.bioSummary &&
        (looksLikeHtml(profile.bioSummary) ? (
          <MarkdownHtml html={profile.bioSummary} className={cn(BIO_PROSE_CLASS, "mt-3")} linkify />
        ) : (
          <p className="mc-txt-recessed-normal text-base text-text-secondary leading-relaxed mt-3">
            {linkify(profile.bioSummary)}
          </p>
        ))}

      <div className="clear-both" />
    </div>
  );
}

import { compareByDisplayOrder, PLATFORM_CONFIG } from "@musiccloud/shared";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { PlatformButton } from "@/components/platform/PlatformButton";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { LogoView } from "@/components/ui/LogoView";
import type { PlatformLink } from "@/lib/types/media-card";

function visiblePlatforms(platforms: PlatformLink[]): PlatformLink[] {
  return platforms.filter((p) => !PLATFORM_CONFIG[p.platform]?.hidden);
}

interface EmbedCardIslandProps {
  size: string;
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  album?: string;
  platforms: PlatformLink[];
}

export function EmbedCardIsland({
  size,
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  album,
  platforms,
}: EmbedCardIslandProps) {
  const sorted = platforms.toSorted((a, b) => compareByDisplayOrder(a.platform, b.platform));

  switch (size) {
    case "small":
      return (
        <EmbedSmall
          title={title}
          artist={artist}
          artworkUrl={artworkUrl}
          shortUrl={shortUrl}
          platforms={sorted.slice(0, 6)}
        />
      );
    case "large":
      return (
        <EmbedLarge
          title={title}
          artist={artist}
          artworkUrl={artworkUrl}
          shortUrl={shortUrl}
          metaLine={metaLine}
          album={album}
          platforms={sorted}
        />
      );
    default:
      return (
        <EmbedRegular
          title={title}
          artist={artist}
          artworkUrl={artworkUrl}
          shortUrl={shortUrl}
          metaLine={metaLine}
          platforms={sorted.slice(0, 6)}
        />
      );
  }
}

function EmbedSmall({
  title,
  artist,
  artworkUrl,
  shortUrl,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  platforms: PlatformLink[];
}) {
  return (
    <EmbossedCard
      padding="10px"
      radius="14px"
      className="w-[400px] h-[88px] flex items-center gap-3 bg-surface-elevated shadow-lg"
    >
      <a href={shortUrl} target="_blank" rel="noopener noreferrer">
        <img className="size-[68px] rounded-lg object-cover flex-shrink-0" src={artworkUrl} alt={title} />
      </a>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-text-primary truncate no-underline"
        >
          {title}
        </a>
        <span className="text-xs text-text-secondary truncate">{artist}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex gap-1">
            {visiblePlatforms(platforms).map((p) => (
              <a key={p.platform} href={p.url} target="_blank" rel="noopener noreferrer">
                <PlatformIcon platform={p.platform} className="size-[22px]" colored />
              </a>
            ))}
          </div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto pr-2 inline-flex items-center text-text-muted hover:text-text-secondary no-underline"
          >
            <LogoView className="h-4 w-auto" />
          </a>
        </div>
      </div>
    </EmbossedCard>
  );
}

function EmbedRegular({
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  platforms: PlatformLink[];
}) {
  return (
    <EmbossedCard padding="0" radius="0.75rem" className="w-[320px] bg-surface-elevated shadow-lg">
      <div className="w-full aspect-square overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="size-full object-cover" src={artworkUrl} alt={title} />
        </a>
      </div>
      <div className="p-3.5 flex flex-col gap-2">
        <div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold text-text-primary truncate block no-underline"
          >
            {title}
          </a>
          <p className="text-[13px] text-text-secondary">{artist}</p>
          {metaLine && <p className="text-xs text-text-muted font-mono">{metaLine}</p>}
        </div>
        <RecessedCard className="p-1.5" radius="0.5rem">
          <RecessedCard.Body className="flex justify-between flex-wrap">
            {visiblePlatforms(platforms).map((p) => (
              <a
                key={p.platform}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:scale-110 transition-transform"
              >
                <PlatformIcon platform={p.platform} className="size-8" colored />
              </a>
            ))}
          </RecessedCard.Body>
        </RecessedCard>
        <div className="flex justify-center mt-1">
          <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
            <LogoView className="h-5 w-auto" />
          </a>
        </div>
      </div>
    </EmbossedCard>
  );
}

function EmbedLarge({
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  album,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  album?: string;
  platforms: PlatformLink[];
}) {
  return (
    <EmbossedCard padding="0" radius="0.75rem" className="w-[400px] bg-surface-elevated shadow-lg">
      <div className="w-full aspect-square overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="size-full object-cover" src={artworkUrl} alt={title} />
        </a>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[17px] font-semibold text-text-primary block no-underline"
          >
            {title}
          </a>
          <p className="text-sm text-text-secondary">{artist}</p>
          {album && <p className="text-xs text-text-muted italic">{album}</p>}
          {metaLine && <p className="text-xs text-text-muted font-mono">{metaLine}</p>}
        </div>
        <RecessedCard className="p-1.5" radius="0.5rem">
          <RecessedCard.Body className="grid grid-cols-2 gap-1.5">
            {visiblePlatforms(platforms).map((p) => (
              <PlatformButton key={p.platform} platform={p.platform} url={p.url} songTitle={title} size="sm" />
            ))}
          </RecessedCard.Body>
        </RecessedCard>
        <div className="flex justify-center mt-1">
          <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
            <LogoView className="h-5 w-auto" />
          </a>
        </div>
      </div>
    </EmbossedCard>
  );
}

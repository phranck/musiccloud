import { compareByDisplayOrder } from "@musiccloud/shared";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { PlatformButton } from "@/components/platform/PlatformButton";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { BrandName } from "@/components/ui/BrandName";
import type { PlatformLink } from "@/lib/types/media-card";

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
  const sorted = [...platforms].sort((a, b) => compareByDisplayOrder(a.platform, b.platform));

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
          platforms={sorted}
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
    <div className="w-[400px] h-[88px] flex items-center gap-3 p-[10px] bg-surface-elevated border border-white/[0.08] rounded-[14px] shadow-lg">
      <a href={shortUrl} target="_blank" rel="noopener noreferrer">
        <img className="w-[68px] h-[68px] rounded-lg object-cover flex-shrink-0" src={artworkUrl} alt={title} />
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
            {platforms.map((p) => (
              <a key={p.platform} href={p.url} target="_blank" rel="noopener noreferrer">
                <PlatformIcon platform={p.platform} className="w-[22px] h-[22px]" colored />
              </a>
            ))}
          </div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] text-text-muted hover:text-text-secondary no-underline"
          >
            <BrandName />
          </a>
        </div>
      </div>
    </div>
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
    <div className="w-[400px] bg-surface-elevated border border-white/[0.08] rounded-xl shadow-lg overflow-hidden">
      <div className="w-full aspect-square overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="w-full h-full object-cover" src={artworkUrl} alt={title} />
        </a>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold text-text-primary truncate block no-underline"
          >
            {title}
          </a>
          <p className="text-[13px] text-text-secondary">{artist}</p>
          {metaLine && <p className="text-xs text-text-muted font-mono">{metaLine}</p>}
        </div>
        <RecessedCard className="rounded-lg p-2">
          <div className="flex justify-between flex-wrap">
            {platforms.map((p) => (
              <a
                key={p.platform}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:scale-110 transition-transform"
              >
                <PlatformIcon platform={p.platform} className="w-8 h-8" colored />
              </a>
            ))}
          </div>
        </RecessedCard>
        <div className="flex justify-center mt-1">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-muted hover:text-text-secondary no-underline inline-flex items-baseline gap-1"
          >
            powered by <BrandName />
          </a>
        </div>
      </div>
    </div>
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
    <div className="w-[400px] bg-surface-elevated border border-white/[0.08] rounded-xl shadow-lg overflow-hidden">
      <div className="w-full aspect-square overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="w-full h-full object-cover" src={artworkUrl} alt={title} />
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
        <RecessedCard className="rounded-lg p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {platforms.map((p) => (
              <PlatformButton key={p.platform} platform={p.platform} url={p.url} songTitle={title} size="sm" />
            ))}
          </div>
        </RecessedCard>
        <div className="flex justify-center mt-1">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-muted hover:text-text-secondary no-underline inline-flex items-baseline gap-1"
          >
            powered by <BrandName />
          </a>
        </div>
      </div>
    </div>
  );
}

import { cn, type Platform, PLATFORM_CONFIG } from "../lib/utils";
import { PlatformIcon } from "./PlatformIcon";

export interface SharePageData {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  platforms: {
    platform: Platform;
    url: string;
  }[];
  shortId: string;
}

interface SharePageProps {
  data: SharePageData;
}

/**
 * Server-rendered share page that recipients see when opening a shared link.
 * Designed to work WITHOUT JavaScript (SSR-only for OG crawlers).
 * Uses minimal interactivity - platform buttons are plain <a> links.
 */
export function SharePage({ data }: SharePageProps) {
  const availablePlatforms = data.platforms;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      {/* Album Art - Hero Element */}
      <div
        className={cn(
          "w-48 h-48 md:w-64 md:h-64 rounded-2xl overflow-hidden",
          "shadow-2xl",
          "mb-6",
        )}
      >
        <img
          src={data.albumArtUrl}
          alt={`${data.title} by ${data.artist}`}
          className="w-full h-full object-cover"
          width={256}
          height={256}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </div>

      {/* Song Info */}
      <h1 className="text-2xl md:text-3xl font-bold text-text-primary text-center">
        {data.title}
      </h1>
      <p className="text-lg text-text-secondary text-center mt-1">
        {data.artist}
      </p>
      {data.album && (
        <p className="text-sm text-text-muted text-center mt-0.5">
          {data.album}
        </p>
      )}

      {/* Platform Buttons - Full width, stacked */}
      <div className="w-full max-w-sm mt-8 space-y-3">
        {availablePlatforms.map((p) => {
          const config = PLATFORM_CONFIG[p.platform];
          return (
            <a
              key={p.platform}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-4 w-full",
                "px-5 py-4 rounded-xl",
                "bg-surface-elevated/80",
                "border border-white/[0.08]",
                "transition-all duration-100",
                "hover:scale-[1.02] hover:shadow-lg",
                "active:scale-[0.98]",
                "min-h-[56px]",
              )}
              style={
                {
                  "--platform-color": config.color,
                } as React.CSSProperties
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 24px ${config.color}40`;
                e.currentTarget.style.borderColor = `${config.color}60`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "";
                e.currentTarget.style.borderColor = "";
              }}
              aria-label={`Open ${data.title} on ${config.label} (opens in new window)`}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <PlatformIcon
                  platform={p.platform}
                  className="w-5 h-5"
                />
              </div>
              <span className="font-medium text-base text-text-primary flex-1">
                Listen on {config.label}
              </span>
              <svg
                className="w-5 h-5 text-text-muted flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          );
        })}
      </div>

      {/* Growth loop - subtle CTA */}
      <div className="mt-12 text-center">
        <a
          href="/"
          className={cn(
            "text-sm text-text-muted hover:text-text-secondary",
            "transition-colors duration-200",
          )}
        >
          Create your own link on{" "}
          <span className="font-medium text-accent-hover">music.cloud</span>
        </a>
      </div>
    </div>
  );
}

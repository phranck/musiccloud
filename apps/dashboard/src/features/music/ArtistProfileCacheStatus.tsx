import type {
  ArtistProfileCacheState,
  ArtistProfileCacheStatus as ArtistProfileCacheStatusValue,
  ArtistProfileProvider,
} from "@musiccloud/shared";
import type { ComponentPropsWithoutRef } from "react";

import { dashboardCopy } from "@/copy/dashboard";

const ArtistProfileCacheStateValue = {
  Fresh: "fresh",
  Stale: "stale",
  Missing: "missing",
  Refreshing: "refreshing",
  Failed: "failed",
} as const satisfies Record<string, ArtistProfileCacheState>;

const PROFILE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATE_CLASS: Record<ArtistProfileCacheState, string> = {
  [ArtistProfileCacheStateValue.Fresh]: "text-green-500",
  [ArtistProfileCacheStateValue.Stale]: "text-amber-500",
  [ArtistProfileCacheStateValue.Missing]: "text-[var(--ds-text-muted)]",
  [ArtistProfileCacheStateValue.Refreshing]: "text-sky-500",
  [ArtistProfileCacheStateValue.Failed]: "text-red-500",
};

const PROVIDER_LABEL: Record<ArtistProfileProvider, string> = {
  spotify: "Spotify",
  deezer: "Deezer",
  lastfm: "Last.fm",
};

interface ArtistProfileCacheStatusProps extends ComponentPropsWithoutRef<"div"> {
  status: ArtistProfileCacheStatusValue;
}

/** Compact table-cell presentation for cache state and safe audit metadata. */
export function ArtistProfileCacheStatus({ status, className = "", ...rest }: ArtistProfileCacheStatusProps) {
  const labels = dashboardCopy.music.artists;
  const providers = status.providers.map((provider) => PROVIDER_LABEL[provider]).join(", ");
  return (
    <div className={`flex flex-col gap-0.5 text-xs ${className}`} {...rest}>
      <span className={`font-medium ${STATE_CLASS[status.state]}`}>{labels.profileStates[status.state]}</span>
      <span className="text-[var(--ds-text-muted)]">{providers || labels.profileProvidersEmpty}</span>
      {status.profileUpdatedAt && status.ageMs !== null && (
        <span className="text-[var(--ds-text-muted)]">
          <time dateTime={status.profileUpdatedAt} title={status.profileUpdatedAt}>
            {labels.profileUpdatedLabel}: {PROFILE_DATE_FORMATTER.format(new Date(status.profileUpdatedAt))}
          </time>
          {" · "}
          <span title={status.profileUpdatedAt}>
            {labels.profileAgeLabel}: {formatAge(status.ageMs)}
          </span>
        </span>
      )}
      {status.latestManualRefresh && (
        <span className="text-[var(--ds-text-muted)]">
          {labels.profileLatestManualLabel}: {labels.profileOutcomes[status.latestManualRefresh.outcome]}
        </span>
      )}
      {status.latestManualRefresh?.errorCode && status.latestManualRefresh.errorId && (
        <code className="text-[var(--ds-danger-text)]">
          {status.latestManualRefresh.errorCode} · {status.latestManualRefresh.errorId}
        </code>
      )}
    </div>
  );
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

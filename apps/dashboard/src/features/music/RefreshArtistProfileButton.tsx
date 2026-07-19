import { type ArtistProfileRefreshResponse, ENDPOINTS } from "@musiccloud/shared";
import { ArrowsClockwise as ArrowsClockwiseIcon, Check as CheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { api } from "@/lib/api";
import type { ApiRequestError } from "@/shared/utils/api-error";

interface RefreshArtistProfileButtonProps {
  artistEntityId: string;
  refreshSilently: () => Promise<void>;
}

interface VisibleError {
  message: string;
  errorId: string | null;
}

export function RefreshArtistProfileButton({ artistEntityId, refreshSilently }: RefreshArtistProfileButtonProps) {
  const labels = dashboardCopy.music.artists;
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<VisibleError | null>(null);

  useEffect(() => {
    if (!confirmed) return;
    const timeout = window.setTimeout(() => setConfirmed(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [confirmed]);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setConfirmed(false);
    setError(null);

    let failure: unknown;
    try {
      await api.post<ArtistProfileRefreshResponse>(ENDPOINTS.admin.artists.refreshProfile(artistEntityId));
    } catch (requestError) {
      failure = requestError;
    }

    try {
      await refreshSilently();
    } catch (refreshError) {
      failure ??= refreshError;
    }

    if (failure) setError(toVisibleError(failure));
    else setConfirmed(true);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-[var(--ds-space-xs)]">
      <TableActionButton
        onClick={handleClick}
        disabled={busy}
        title={labels.profileRefreshTooltip}
        icon={
          confirmed ? (
            <CheckIcon weight="bold" className="size-3 text-[var(--ds-success-text)]" />
          ) : (
            <ArrowsClockwiseIcon weight="duotone" className={`size-3 ${busy ? "animate-spin" : ""}`} />
          )
        }
        label={confirmed ? labels.profileRefreshConfirm : labels.profileRefreshLabel}
      />
      {error && (
        <span role="alert" className="text-right text-xs text-[var(--ds-danger-text)]">
          {error.message}
          {error.errorId ? ` ${labels.profileErrorIdLabel}: ${error.errorId}` : ""}
        </span>
      )}
    </div>
  );
}

function toVisibleError(error: unknown): VisibleError {
  if (!(error instanceof Error)) return { message: "Artist profile refresh failed.", errorId: null };
  const requestError = error as ApiRequestError;
  return {
    message: error.message || "Artist profile refresh failed.",
    errorId: requestError.errorId ?? null,
  };
}

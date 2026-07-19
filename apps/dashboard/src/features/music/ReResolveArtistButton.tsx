import { ENDPOINTS } from "@musiccloud/shared";
import { ArrowsClockwise as ArrowsClockwiseIcon, Check as CheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { api } from "@/lib/api";

interface ReResolveArtistButtonProps {
  /** The artist share's short id, or `null` when the artist has no share URL yet. */
  shortId: string | null;
}

/** Marks the share-resolution cache stale without touching the profile-info cache. */
export function ReResolveArtistButton({ shortId }: ReResolveArtistButtonProps) {
  const labels = dashboardCopy.music.artists;
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirmed) return;
    const timeout = window.setTimeout(() => setConfirmed(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [confirmed]);

  if (!shortId) return null;

  async function handleClick() {
    if (busy || !shortId) return;
    setBusy(true);
    try {
      await api.post(ENDPOINTS.admin.artists.invalidateCache(shortId));
      setConfirmed(true);
    } catch {
      // The legacy re-resolution action has no correlated backend error contract.
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableActionButton
      onClick={handleClick}
      disabled={busy}
      title={labels.reResolveTooltip}
      icon={
        confirmed ? (
          <CheckIcon weight="bold" className="size-3 text-green-500" />
        ) : (
          <ArrowsClockwiseIcon weight="duotone" className={`size-3 ${busy ? "animate-spin" : ""}`} />
        )
      }
      label={confirmed ? labels.reResolveConfirm : labels.reResolveLabel}
    />
  );
}

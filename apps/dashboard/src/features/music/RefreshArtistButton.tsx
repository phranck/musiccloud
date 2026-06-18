import { ENDPOINTS } from "@musiccloud/shared";
import { ArrowsClockwise as ArrowsClockwiseIcon, Check as CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

interface RefreshArtistButtonProps {
  /** The artist share's short id, or `null` when the artist has no share URL yet. */
  shortId: string | null;
}

/**
 * Per-row "refresh" action in the admin ArtistsPage, rendered as a standard
 * table action button (icon + label, right-aligned) — visually identical to
 * the "edit" actions used elsewhere.
 *
 * Posts to `/admin/artists/:shortId/invalidate-cache`, which rewinds the
 * artist row's `updated_at` to the Unix epoch. Unlike tracks and albums,
 * artist resolves still gate on that timestamp (48h TTL via `tryArtistCache`),
 * so this genuinely forces the next resolve of the artist's share URL to
 * re-fetch fresh profile data (genres, links, top tracks) from the upstream
 * source.
 *
 * Disabled while the request is in flight; briefly swaps to a checkmark on
 * success. Renders nothing when the artist has no share URL yet, since there
 * is no cache entry to refresh.
 */
export function RefreshArtistButton({ shortId }: RefreshArtistButtonProps) {
  const { messages } = useI18n();
  const ma = messages.music.artists;
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!shortId) return null;

  async function handleClick() {
    if (busy || !shortId) return;
    setBusy(true);
    try {
      await api.post(ENDPOINTS.admin.artists.invalidateCache(shortId));
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 1500);
    } catch {
      // Silent failure — nothing actionable for the operator here.
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableActionButton
      onClick={handleClick}
      disabled={busy}
      title={ma.refreshTooltip}
      icon={
        confirmed ? (
          <CheckIcon weight="bold" className="size-3 text-green-500" />
        ) : (
          <ArrowsClockwiseIcon weight="duotone" className={`size-3 ${busy ? "animate-spin" : ""}`} />
        )
      }
      label={confirmed ? ma.refreshConfirm : ma.refreshLabel}
    />
  );
}

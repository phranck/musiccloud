import { ENDPOINTS } from "@musiccloud/shared";
import { ArrowsClockwise as ArrowsClockwiseIcon, Check as CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { useI18n } from "@/context/I18nContext";
import {
  type AdminMusicItemKind,
  AdminMusicItemKind as AdminMusicItemKindValue,
} from "@/features/music/adminMusicKind";
import { api } from "@/lib/api";

const INVALIDATE_CACHE_ENDPOINT: Record<AdminMusicItemKind, (shortId: string) => string> = {
  [AdminMusicItemKindValue.Tracks]: ENDPOINTS.admin.tracks.invalidateCache,
  [AdminMusicItemKindValue.Albums]: ENDPOINTS.admin.albums.invalidateCache,
  [AdminMusicItemKindValue.Artists]: ENDPOINTS.admin.artists.invalidateCache,
};

interface InvalidateCacheButtonProps {
  shortId: string | null;
  kind: AdminMusicItemKind;
}

/**
 * Per-row "refresh cache" action used in TracksPage / AlbumsPage / ArtistsPage.
 *
 * Posts to `/admin/{kind}/:shortId/invalidate-cache` which marks the underlying
 * row as administratively stale (`updated_at = epoch`). Track and album
 * resolver hits no longer use that timestamp as a freshness gate; artist
 * profiles still use it as a TTL input.
 *
 * Renders a small icon button. Briefly shows a checkmark on success.
 */
export function InvalidateCacheButton({ shortId, kind }: InvalidateCacheButtonProps) {
  const { messages } = useI18n();
  const m = messages.music.table;
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!shortId) return null;

  async function handleClick() {
    if (busy || !shortId) return;
    setBusy(true);
    try {
      await api.post(INVALIDATE_CACHE_ENDPOINT[kind](shortId));
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 1500);
    } catch {
      // Silent failure — the row still works; nothing the user can do here.
    } finally {
      setBusy(false);
    }
  }

  const label = confirmed ? m.invalidateCacheConfirm : m.invalidateCache;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="p-1 rounded transition-colors hover:bg-[var(--ds-surface-raised)] disabled:opacity-40"
    >
      {confirmed ? (
        <CheckIcon weight="bold" className="w-4 h-4 text-green-500" />
      ) : (
        <ArrowsClockwiseIcon
          weight="regular"
          className={`w-4 h-4 text-[var(--ds-text-muted)] ${busy ? "animate-spin" : "opacity-60 hover:opacity-100"}`}
        />
      )}
    </button>
  );
}

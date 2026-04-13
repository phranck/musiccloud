import { ArrowsClockwise as ArrowsClockwiseIcon, Check as CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

type Kind = "tracks" | "albums" | "artists";

interface InvalidateCacheButtonProps {
  shortId: string | null;
  kind: Kind;
}

/**
 * Per-row "refresh cache" action used in TracksPage / AlbumsPage / ArtistsPage.
 *
 * Posts to `/admin/{kind}/:shortId/invalidate-cache` which marks the underlying
 * row as stale (`updated_at = epoch`). The share URL keeps working — only the
 * cached resolved metadata is forced to re-fetch on the next access.
 *
 * Renders a small icon button consistent with FeaturedToggle. Briefly shows a
 * checkmark on success.
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
      await api.post(`/admin/${kind}/${shortId}/invalidate-cache`);
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

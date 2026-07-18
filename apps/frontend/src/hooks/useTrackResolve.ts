import type { ArtistTopTrack } from "@musiccloud/shared";
import { useCallback, useState } from "react";
import type { ArtistPanelTrackResolveHandler } from "@/components/artist/artistPanelTypes";
import { useToastSafe } from "@/context/ToastContext";
import { commonCopy } from "@/copy/common";
import { ResolveSignal, sendMusicSignal } from "@/lib/analytics/umami";

/**
 * Shared activation logic for an artist-panel track, used by both the list row
 * ({@link import("@/components/artist/PopularTrack").PopularTrack}) and the grid
 * item — so the busy state, analytics signals, and failure toast live in one
 * place regardless of the presentation.
 *
 * Activating fires the `cardSignal`, flips `resolving` true, calls
 * {@link ArtistPanelTrackResolveHandler} to resolve + play the track in place,
 * and surfaces a failure (including a missing handler) as an error toast.
 * Re-entrancy is guarded while a resolve is already in flight.
 *
 * @param track - The track to resolve on activation.
 * @param cardSignal - Analytics signal fired on activation.
 * @param onTrackResolve - In-place resolve handler; its absence is treated as an error.
 * @param onResolveStart - Optional callback fired right before resolving begins.
 * @returns `resolving` (busy flag for the spinner/disabled state) and `activate`.
 */
export function useTrackResolve(
  track: ArtistTopTrack,
  cardSignal: string,
  onTrackResolve?: ArtistPanelTrackResolveHandler,
  onResolveStart?: () => void,
): { resolving: boolean; activate: () => Promise<void> } {
  const toast = useToastSafe();
  const [resolving, setResolving] = useState(false);

  const activate = useCallback(async () => {
    if (resolving) return;

    sendMusicSignal(cardSignal);
    setResolving(true);
    onResolveStart?.();
    try {
      if (!onTrackResolve) {
        throw new Error("missing in-place resolve handler");
      }

      await onTrackResolve(track);
      setResolving(false);
    } catch (err) {
      sendMusicSignal(err instanceof Error ? ResolveSignal.FailedClient : ResolveSignal.FailedUnknown);
      setResolving(false);
      if (import.meta.env.DEV) console.warn("[useTrackResolve] resolve failed:", err);
      toast?.show(commonCopy.error.generic, "error");
    }
  }, [cardSignal, onResolveStart, onTrackResolve, resolving, track, toast]);

  return { resolving, activate };
}

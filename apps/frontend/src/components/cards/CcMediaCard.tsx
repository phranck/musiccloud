import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { CcInfoCard } from "@/components/cards/CcInfoCard";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import {
  type CcTrackContentConfiguration,
  MediaCardContentTypeValue,
  type ShareContentConfiguration,
} from "@/lib/types/media-card";

interface CcMediaCardProps {
  content: CcTrackContentConfiguration;
  className?: string;
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

/**
 * Adapts a {@link CcTrackContentConfiguration} into the
 * {@link ShareContentConfiguration} shape that {@link MediaSummaryCard}
 * consumes.
 *
 * `MediaSummaryCard` renders only the scaffold the CC page needs (cover + VFD +
 * player + share button) and ignores any platform fields — those live in the
 * separate `ServicesCard`, which the CC page swaps for {@link CcInfoCard}. The
 * adapter therefore carries empty platform fields and maps the CC stream into
 * the player's `previewUrl` slot:
 *
 * - `previewUrl = streamUrl` — the full-length Jamendo stream. The audio player
 *   seeds a 30 s placeholder duration and overrides it from the real stream's
 *   `loadedmetadata`, so passing the full URL plays the whole track with its
 *   true duration (no player change required).
 * - `type = "share"` so `MediaSummaryCard`'s share button copies the musiccloud
 *   `shortUrl`.
 *
 * @param content - The resolved CC track content configuration.
 * @returns A `ShareContentConfiguration` for `MediaSummaryCard`.
 */
function ccSummaryConfig(content: CcTrackContentConfiguration): ShareContentConfiguration {
  return {
    type: MediaCardContentTypeValue.Share,
    title: content.title,
    artist: content.artist,
    album: content.album,
    artworkUrl: content.artworkUrl,
    metaLine: content.metaLine,
    previewUrl: content.streamUrl,
    shortId: content.shortId,
    platforms: [],
    platformsLabel: "",
    platformsLabelKey: "",
    shortUrl: content.shortUrl,
  };
}

/**
 * Renders the Creative-Commons track page.
 *
 * Shares the commercial result scaffold verbatim — `MediaSummaryCard` provides
 * the glass card, cover + VFD, full-stream player, and share button — then
 * stacks {@link CcInfoCard} below it in place of the commercial platform grid
 * (`ServicesCard`). This mirrors the desktop share layout's
 * `MediaSummaryCard` + `ServicesCard` column without mutating any commercial
 * card behaviour: the CC adapter is local to this component, and the commercial
 * cards receive only their own configuration types elsewhere.
 *
 * @param content - The resolved CC track content configuration.
 * @param className - Optional extra classes forwarded to the summary card.
 * @param animated - When true, both cards play the shared zoom-in entrance.
 * @param onPreviewStatusChange - Forwarded to the player so callers can react
 *   to play/pause status (e.g. to drive the VFD status line).
 */
export function CcMediaCard({ content, className, animated = false, onPreviewStatusChange }: CcMediaCardProps) {
  return (
    <div className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]">
      <MediaSummaryCard
        content={ccSummaryConfig(content)}
        className={className}
        animated={animated}
        onPreviewStatusChange={onPreviewStatusChange}
      />
      <CcInfoCard content={content} animated={animated} />
    </div>
  );
}

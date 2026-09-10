import { YOUTUBE_EMBED_HOST, YOUTUBE_FRAME_PERMISSIONS, YOUTUBE_FRAME_SANDBOX } from "@musiccloud/shared";
import * as React from "react";

interface VideoEmbedProps {
  /** Where the video is embedded from, as the renderer built it. */
  href: string;
  /** The shape the video opens at, so the room is held before anything loads. */
  aspectRatio?: string;
  /** What the link reads before a reader plays it. */
  label: string;
}

/**
 * A video that contacts nothing until a reader asks for it.
 *
 * A page holding a video would otherwise load a YouTube frame for everybody who
 * opens the page, including everybody who never plays it, which sets a cookie
 * and tells a third party what was read. This stands as a link at the shape the
 * video will take, and becomes the frame on the first click, so the page holds
 * that room from the first paint and nothing moves when the swap happens.
 *
 * The address is checked here as well as where it was built, because this reads
 * it back off the markup and markup is not a promise.
 *
 * @returns The link, or the frame once it has been asked for.
 */
export function VideoEmbed({ href, aspectRatio, label }: VideoEmbedProps) {
  const [playing, setPlaying] = React.useState(false);

  const address = React.useMemo(() => {
    try {
      const parsed = new URL(href);
      if (parsed.origin !== YOUTUBE_EMBED_HOST) return null;
      parsed.searchParams.set("autoplay", "1");
      return parsed.toString();
    } catch {
      return null;
    }
  }, [href]);

  const play = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setPlaying(true);
  }, []);

  if (playing && address) {
    return (
      <iframe
        src={address}
        title={label}
        allow={YOUTUBE_FRAME_PERMISSIONS}
        sandbox={YOUTUBE_FRAME_SANDBOX}
        allowFullScreen
        style={{ aspectRatio }}
      />
    );
  }

  return (
    <a className="mc-video__link" href={href} rel="noopener noreferrer" style={{ aspectRatio }} onClick={play}>
      {label}
    </a>
  );
}

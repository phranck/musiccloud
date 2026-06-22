import type { Ref } from "react";

/** Shared fallback cover used when artwork is missing or fails to load. */
const ARTWORK_FALLBACK_URL = "/og/musiccloud.jpg";

/**
 * Props for {@link ArtworkImage}.
 *
 * @property url - The artwork URL; an empty string renders the shared fallback.
 * @property alt - Accessible alt text for the cover image.
 * @property className - Optional extra classes appended after the base sizing.
 * @property ref - Optional ref to the underlying `<img>` so callers can animate
 *   it (the cover-swap timeline remounts the buffers per swap generation, so the
 *   refs always point at fresh nodes).
 */
interface ArtworkImageProps {
  url: string;
  alt: string;
  className?: string;
  ref?: Ref<HTMLImageElement>;
}

/**
 * Cover image with the shared artwork fallback. Both a missing `url` and a load
 * error fall back to {@link ARTWORK_FALLBACK_URL}, so a broken cover never
 * leaves an empty box.
 *
 * @param url - The artwork URL (empty renders the fallback).
 * @param alt - Accessible alt text.
 * @param className - Optional extra classes.
 * @param ref - Optional ref to the `<img>` element.
 */
export function ArtworkImage({ url, alt, className, ref }: ArtworkImageProps) {
  const src = url || ARTWORK_FALLBACK_URL;
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={`size-full object-cover ${className ?? ""}`}
      width={480}
      height={480}
      onError={(e) => {
        e.currentTarget.src = ARTWORK_FALLBACK_URL;
      }}
    />
  );
}

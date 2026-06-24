interface ArtistNoticeContentProps {
  /** The notice message to display, centered and muted. */
  message: string;
}

/**
 * Centered, muted notice line used inside an artist card's body to explain an
 * empty or error state (e.g. "no events" / "couldn't load"). Pure text leaf —
 * the surrounding card well is supplied by the caller.
 */
export function ArtistNoticeContent({ message }: ArtistNoticeContentProps) {
  return <p className="text-sm text-text-secondary text-center">{message}</p>;
}

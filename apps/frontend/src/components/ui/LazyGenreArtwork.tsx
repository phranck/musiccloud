import { useEffect, useReducer, useRef, useState } from "react";
import { DEFAULT_COVER_FALLBACK_URL } from "@/components/ui/coverFallback";
import { createConcurrencyGate } from "@/lib/net/concurrencyGate";
import { cn } from "@/lib/utils";

interface LazyGenreArtworkProps {
  url: string;
  fallbackUrl?: string;
}

// Global request-concurrency gate: at most 10 artwork tiles may have an
// in-flight <img> request at the same time. Anything beyond waits in a FIFO
// queue. Prevents the "user scrolls the whole grid before anything resolved"
// case from collapsing the cold-cache generation queue on the backend — each
// tile still gets its turn, but never more than 10 at once. A single shared
// gate so all tiles on the page contend for the same 10 slots.
const artworkGate = createConcurrencyGate(10);

/**
 * Gives a tile's slot back to {@link artworkGate}, at most once per tile. A
 * slot that is never returned is lost for the rest of the page session, and
 * after ten of them every tile spins until a reload.
 *
 * @param slotReleasedRef - The tile's flag recording that its slot is back.
 */
function releaseSlotOnce(slotReleasedRef: { current: boolean }) {
  if (slotReleasedRef.current) return;
  slotReleasedRef.current = true;
  artworkGate.release();
}

/**
 * Defers the artwork request until the tile scrolls into view, then passes
 * through a global concurrency gate (max 10 parallel requests) before
 * actually setting the <img> src. A spinner fills the slot while the tile
 * is either waiting in the queue or the image is still loading.
 *
 * `rootMargin` intentionally errs on the generous side so tiles start queuing
 * just before they scroll into view. Even on fast scrolling the backend sees
 * a maximum of 10 parallel artwork fetches at a time; everything else
 * patiently waits its turn, which keeps the Jimp / Last.fm pipeline from
 * overloading.
 */
export function LazyGenreArtwork({ url, fallbackUrl = DEFAULT_COVER_FALLBACK_URL }: LazyGenreArtworkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [intersected, markIntersected] = useReducer(() => true, false);
  const [canLoad, setCanLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const slotReleasedRef = useRef(false);

  // Watch for scroll-into-view → mark tile as "wants to load".
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          markIntersected();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // Queue for a slot once the tile wants to load.
  useEffect(() => {
    if (!intersected || canLoad) return;
    let cancelled = false;
    artworkGate.acquire().then(() => {
      if (cancelled) {
        artworkGate.release();
        return;
      }
      setCanLoad(true);
    });
    return () => {
      cancelled = true;
    };
  }, [intersected, canLoad]);

  // A tile that unmounts while its image is still loading (the user picked a
  // genre or left the grid) gives its slot back here, because neither image
  // handler will ever run for it.
  useEffect(() => {
    if (!canLoad) return;
    return () => releaseSlotOnce(slotReleasedRef);
  }, [canLoad]);

  // Release slot exactly once when the <img> resolves (either success or
  // the first error — the fallback img that the onError swap loads after
  // that is a small static file and doesn't need a slot).

  return (
    <div ref={ref} className="relative size-full">
      {canLoad && (
        <img
          src={errored ? fallbackUrl : url}
          alt=""
          width={512}
          height={512}
          className={cn("size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
          onLoad={() => {
            setLoaded(true);
            releaseSlotOnce(slotReleasedRef);
          }}
          onError={() => {
            releaseSlotOnce(slotReleasedRef);
            if (!errored) setErrored(true);
          }}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-6 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

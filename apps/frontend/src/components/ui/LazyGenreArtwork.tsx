import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LazyGenreArtworkProps {
  url: string;
  fallbackUrl?: string;
}

/**
 * Defers the artwork request until the tile scrolls into view, then shows a
 * spinner while the JPEG is being generated / fetched. Avoids the cold-start
 * stampede where all ~250 tiles of the browse grid fire at once and overwhelm
 * the backend's CPU-bound Jimp pipeline, leading to proxy timeouts and 503s
 * on a freshly purged cache.
 *
 * `rootMargin` intentionally errs on the generous side so tiles start loading
 * just before they actually scroll into view — the user perceives no spinner
 * on normal scroll, but the first-paint burst is still capped at "whatever
 * fits in viewport + one row of margin".
 */
export function LazyGenreArtwork({ url, fallbackUrl = "/og/default.jpg" }: LazyGenreArtworkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [intersected, setIntersected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative w-full h-full">
      {intersected && (
        <img
          src={errored ? fallbackUrl : url}
          alt=""
          width={512}
          height={512}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!errored) setErrored(true);
          }}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

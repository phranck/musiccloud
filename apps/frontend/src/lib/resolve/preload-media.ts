/**
 * Preloads the media of a freshly resolved track so a record swap can commit only
 * once the new cover and audio are ready (the outgoing record keeps playing until
 * then). Every path is failure- and timeout-tolerant: preloading must never hang
 * the resolve flow, so a missing, broken or slow resource resolves anyway.
 */

/** Upper bound (ms) any single preload waits before giving up. Mirrors the resolve abort timeout in `ShareLayout`. */
const PRELOAD_TIMEOUT_MS = 15000;

/** The media a resolved config points at (a `MediaCardContentConfiguration` satisfies this). */
export interface PreloadTarget {
  /** Cover-art URL to decode. */
  artworkUrl?: string | null;
  /** Audio preview/stream URL to warm into the browser cache. */
  previewUrl?: string | null;
}

/**
 * Resolves when `ready` settles (either way), the timeout elapses, or the signal
 * aborts — whichever comes first. Never rejects and never hangs.
 *
 * @param ready - The underlying readiness promise (decode / canplay).
 * @param signal - Optional abort signal.
 * @returns A promise that always resolves.
 */
function raceReady(ready: Promise<unknown>, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, PRELOAD_TIMEOUT_MS);
    signal?.addEventListener("abort", finish, { once: true });
    ready.then(finish, finish);
  });
}

/**
 * Decodes the cover image off-thread so it is paint-ready when the incoming record
 * appears. A missing URL or an environment without `HTMLImageElement.decode`
 * resolves immediately.
 *
 * @param url - Cover URL, or nullish to skip.
 * @param signal - Optional abort signal.
 */
async function decodeCover(url: string | null | undefined, signal?: AbortSignal): Promise<void> {
  if (!url) return;
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  const ready = typeof image.decode === "function" ? image.decode() : Promise.resolve();
  await raceReady(ready, signal);
}

/**
 * Warms the audio URL into the browser cache with a throwaway element so the hub's
 * real audio element can start playing without a network round trip. Waits for the
 * first of `canplaythrough` / `loadedmetadata` / `error`, then releases the element.
 *
 * @param url - Audio URL, or nullish to skip.
 * @param signal - Optional abort signal.
 */
async function preloadAudio(url: string | null | undefined, signal?: AbortSignal): Promise<void> {
  if (!url) return;
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  const ready = new Promise<void>((resolve) => {
    const done = () => resolve();
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("loadedmetadata", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
  await raceReady(ready, signal);
  // Release the throwaway element; its job (a warm HTTP cache) is done.
  audio.removeAttribute("src");
}

/**
 * Preloads a resolved track's cover and audio in parallel, resolving when both are
 * ready (or gave up). Used by `ShareLayout.resolveTrack` in the different-album
 * branch to gate the config swap on the new media, so the outgoing record keeps
 * playing until the swap can commit cleanly.
 *
 * @param target - The resolved config's media URLs.
 * @param options - Optional abort signal (owned by the resolve flow).
 * @returns A promise that always resolves once both preloads settle.
 */
export async function preloadResolvedMedia(target: PreloadTarget, options?: { signal?: AbortSignal }): Promise<void> {
  const signal = options?.signal;
  if (signal?.aborted) return;
  await Promise.all([decodeCover(target.artworkUrl, signal), preloadAudio(target.previewUrl, signal)]);
}

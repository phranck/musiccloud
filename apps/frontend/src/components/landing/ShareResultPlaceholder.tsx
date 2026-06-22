/**
 * Invisible layout placeholder that reserves the share-result area's footprint.
 *
 * Mirrors the dimensions of the real two-column (desktop) / single-column
 * (mobile) share result so the page does not jump when the lazily loaded
 * {@link ShareLayout} streams in behind a `Suspense` boundary, and so the hero's
 * loading state can reserve the same space. It is `opacity-0` and
 * `pointer-events-none` on purpose — its only job is layout stability, not a
 * visible skeleton. The Astro sibling `share/ShareResultPlaceholder.astro` keeps
 * the SSR shells byte-aligned with this.
 */
export function ShareResultPlaceholder() {
  return (
    <div
      className="mx-auto w-full max-w-[512px] min-[1080px]:max-w-[1048px] opacity-0 pointer-events-none"
      aria-hidden="true"
    >
      <div className="hidden min-[1080px]:grid grid-cols-[512px_512px] gap-6">
        <div className="h-[560px]" />
        <div className="h-[560px]" />
      </div>
      <div className="min-[1080px]:hidden h-[520px]" />
    </div>
  );
}

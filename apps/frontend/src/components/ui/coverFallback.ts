/**
 * The fallback artwork served when a cover image is missing or fails to load.
 * The same static asset the backend's OG-image pipeline serves for artless
 * tracks (`apps/backend/src/lib/server/og.ts`), so the file must live in the
 * frontend's `public/` directory (pinned by `LazyGenreArtwork.test.tsx`).
 *
 * Shared by `CoverImage`, `SlideArtwork` and `LazyGenreArtwork` so the fallback
 * path is defined once.
 */
export const DEFAULT_COVER_FALLBACK_URL = "/og/default.jpg";

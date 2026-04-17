import { forwardRef } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { NavigationBackButton } from "@/components/navigation/NavigationBackButton";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";
import { GenreColumn } from "@/components/ui/GenreColumn";
import { GenreRowButton } from "@/components/ui/GenreRowButton";
import { SlideArtwork } from "@/components/ui/SlideArtwork";
import { useLocale, useT } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";
import type { GenreSearchPayload, GenreSearchResults as GenreSearchResultsData } from "@/lib/types/app";
import { cn } from "@/lib/utils";

interface GenreSearchResultsProps {
  results: GenreSearchResultsData;
  /**
   * Parsed view of the submitted query — used to build the natural-
   * language summary shown as the card's headline.
   */
  queryDetails: GenreSearchPayload["queryDetails"];
  /**
   * Non-fatal parser notes to surface under the results. Typically
   * empty; populated when the parser silently reconciled something
   * the user wrote (e.g. combined `count` and `tracks`).
   */
  warnings?: string[];
  /**
   * Called when the user clicks a result row. The handler feeds the
   * `webUrl` back into the normal resolve flow and gets the row's `id`
   * so the panel can highlight the selected row while that follow-up
   * resolve is in flight.
   */
  onSelect: (webUrl: string, id: string) => void;
  onCancel?: () => void;
  onBack?: () => void;
  /**
   * Id of the row the user just clicked. While `loading` is true, that row
   * swaps its cover for the spinning CD and every row is non-interactive.
   * Same contract as `DisambiguationPanel`.
   */
  selectedId?: string | null;
  loading?: boolean;
}

// Size classes for the spinning CD that replaces a row's artwork while the
// clicked candidate is being resolved. Must match the compact artwork tile
// dimensions in `CandidateRowContent` so there is no layout shift.
const COMPACT_ART_SIZE = "w-12 h-12 md:w-14 md:h-14";

/**
 * Three-column (desktop) / stacked (mobile) rendering of a genre-search
 * result. Each list is only rendered when the user actually requested
 * that type — the backend sends `null` otherwise.
 *
 * Row visuals come from the shared {@link CandidateRowContent} so the
 * layout matches the disambiguation list: same artwork + text block
 * structure, just in a denser (`compact`) variant.
 *
 * No FLIP animation here — clicks immediately start a follow-up resolve,
 * and the normal loading state covers the transition.
 */
export const GenreSearchResults = forwardRef<HTMLDivElement, GenreSearchResultsProps>(function GenreSearchResults(
  { results, queryDetails, warnings, onSelect, onCancel, onBack, selectedId, loading = false },
  ref,
) {
  const t = useT();
  const { locale } = useLocale();
  const headline = buildHeadline(queryDetails, t, locale);

  const hasAny =
    (results.tracks && results.tracks.length > 0) ||
    (results.albums && results.albums.length > 0) ||
    (results.artists && results.artists.length > 0);

  const columnCount =
    (results.tracks && results.tracks.length > 0 ? 1 : 0) +
    (results.albums && results.albums.length > 0 ? 1 : 0) +
    (results.artists && results.artists.length > 0 ? 1 : 0);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      // `max-h-[calc(100vh-16rem)]` reserves vertical space for the stack that
      // sits above and below this card when it is visible:
      //
      //   PageHeader       ~ 2.5rem
      //   BrandName h1     ~ 3.5rem  (text-3xl + mb-6)
      //   HeroInput compact~ 3.75rem
      //   mt-8 gap above   ~ 2rem
      //   mb-8 gap below   ~ 2rem
      //                    ≈ 13.75rem — rounded up to 16rem for safety.
      //
      // Combined with `flex flex-col` on the card and `min-h-0 overflow-y-auto`
      // on each Column, this keeps the card inside the viewport and lets
      // overflow scroll *within* each column instead of scrolling the page.
      className={cn(
        "w-full max-w-full mx-auto mt-8 mb-8 animate-fade-in focus:outline-none",
        columnCount === 1 && "md:max-w-sm",
        columnCount === 2 && "md:max-w-2xl",
        columnCount >= 3 && "md:max-w-5xl",
      )}
    >
      <EmbossedCard className="rounded-2xl p-5 flex flex-col max-h-[calc(100vh-16rem)]">
        {onBack && (
          <EmbossedCard.AddOn align="leading">
            <NavigationBackButton onClick={onBack} label={t("genreSearch.backToBrowse")} />
          </EmbossedCard.AddOn>
        )}
        <EmbossedCard.Header className="text-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{headline}</h2>
          <p className="text-sm text-text-secondary mt-1">{t("genreSearch.subtitle")}</p>
        </EmbossedCard.Header>

        <EmbossedCard.Body className="flex-1 min-h-0">
          {!hasAny ? (
            <p className="text-center text-sm text-text-muted py-8">{t("genreSearch.empty")}</p>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-4 flex-1 min-h-0",
                columnCount === 2 && "md:grid-cols-2",
                columnCount >= 3 && "md:grid-cols-3",
              )}
            >
              {results.tracks && (
                <GenreColumn label={t("genreSearch.tracks", { count: String(results.tracks.length) })}>
                  {results.tracks.map((track, i) => {
                    const isSelected = loading && selectedId === track.id;
                    return (
                      <GenreRowButton
                        key={track.id}
                        index={i}
                        onClick={() => onSelect(track.webUrl, track.id)}
                        disabled={loading}
                        ariaLabel={
                          isSelected
                            ? t("genreSearch.loading")
                            : `Resolve track "${track.title}" by ${track.artists.join(", ")}`
                        }
                      >
                        <CandidateRowContent
                          compact
                          artwork={
                            <SlideArtwork
                              active={isSelected}
                              artworkUrl={track.artworkUrl}
                              sizeClass={COMPACT_ART_SIZE}
                            />
                          }
                          primary={track.title}
                          secondary={track.artists.join(", ")}
                          tertiary={track.albumName}
                        />
                      </GenreRowButton>
                    );
                  })}
                </GenreColumn>
              )}

              {results.albums && (
                <GenreColumn label={t("genreSearch.albums", { count: String(results.albums.length) })}>
                  {results.albums.map((album, i) => {
                    const isSelected = loading && selectedId === album.id;
                    return (
                      <GenreRowButton
                        key={album.id}
                        index={i}
                        onClick={() => onSelect(album.webUrl, album.id)}
                        disabled={loading}
                        ariaLabel={
                          isSelected
                            ? t("genreSearch.loading")
                            : `Resolve album "${album.title}" by ${album.artists.join(", ")}`
                        }
                      >
                        <CandidateRowContent
                          compact
                          artwork={
                            <SlideArtwork
                              active={isSelected}
                              artworkUrl={album.artworkUrl}
                              sizeClass={COMPACT_ART_SIZE}
                            />
                          }
                          primary={album.title}
                          secondary={album.artists.join(", ")}
                        />
                      </GenreRowButton>
                    );
                  })}
                </GenreColumn>
              )}

              {results.artists && (
                <GenreColumn label={t("genreSearch.artists", { count: String(results.artists.length) })}>
                  {results.artists.map((artist, i) => {
                    const isSelected = loading && selectedId === artist.id;
                    return (
                      <GenreRowButton
                        key={artist.id}
                        index={i}
                        onClick={() => onSelect(artist.webUrl, artist.id)}
                        disabled={loading}
                        ariaLabel={isSelected ? t("genreSearch.loading") : `Resolve artist ${artist.name}`}
                      >
                        <CandidateRowContent
                          compact
                          artwork={
                            <SlideArtwork
                              active={isSelected}
                              artworkUrl={artist.imageUrl}
                              kind="round"
                              sizeClass={COMPACT_ART_SIZE}
                            />
                          }
                          artworkKind="round"
                          primary={artist.name}
                        />
                      </GenreRowButton>
                    );
                  })}
                </GenreColumn>
              )}
            </div>
          )}
        </EmbossedCard.Body>

        {(warnings?.length || onCancel) && (
          <EmbossedCard.Footer>
            {warnings && warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-text-muted flex-shrink-0" aria-live="polite">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5">
                    <span aria-hidden="true">⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            {onCancel && (
              <div className="text-center mt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={onCancel}
                  className={cn(
                    "text-sm text-text-muted hover:text-text-secondary",
                    "transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
                  )}
                >
                  {t("genreSearch.cancel")}
                </button>
              </div>
            )}
          </EmbossedCard.Footer>
        )}
      </EmbossedCard>
    </div>
  );
});

// ─── Headline builder ───────────────────────────────────────────────────────
//
// Turns the parsed query into a locale-aware natural-language sentence,
// e.g.
//   en:  "10 tracks, albums and artists in jazz"
//        "20 tracks and 10 albums in jazz or rock — a mixed selection"
//   de:  "10 Tracks, Alben und Künstler aus Jazz"
//        "20 Tracks und 10 Alben aus Jazz oder Rock – bunt gemischt"
//
// Case conventions follow the locale:
//   - German treats genre names as substantives (always title-case): "Jazz"
//   - Most other languages keep genre names lowercase in running text: "jazz"
//
// Kept inline (small, only used here); promote to `lib/genre-search/` if a
// second view ever needs the same wording.

type QueryDetails = GenreSearchPayload["queryDetails"];
type TFunc = (key: string, vars?: Record<string, string>) => string;

function buildHeadline(q: QueryDetails, t: TFunc, locale: Locale): string {
  const genreText = formatList(
    q.genres.map((g) => formatGenre(g, locale)),
    t("genreSearch.summary.or"),
  );
  const countsText = buildCountsText(q, t);
  const key = q.vibe === "mixed" ? "genreSearch.summary.mixed" : "genreSearch.summary.hot";
  return t(key, { counts: countsText, genres: genreText });
}

function buildCountsText(q: QueryDetails, t: TFunc): string {
  const hasT = q.tracks !== null;
  const hasA = q.albums !== null;
  const hasAr = q.artists !== null;
  const allEqual = hasT && hasA && hasAr && q.tracks === q.albums && q.albums === q.artists;

  if (allEqual) {
    return `${q.tracks} ${t("genreSearch.summary.allTypes")}`;
  }

  const parts: string[] = [];
  if (hasT) parts.push(`${q.tracks} ${t(q.tracks === 1 ? "genreSearch.summary.track" : "genreSearch.summary.tracks")}`);
  if (hasA) parts.push(`${q.albums} ${t(q.albums === 1 ? "genreSearch.summary.album" : "genreSearch.summary.albums")}`);
  if (hasAr)
    parts.push(`${q.artists} ${t(q.artists === 1 ? "genreSearch.summary.artist" : "genreSearch.summary.artists")}`);

  return formatList(parts, t("genreSearch.summary.and"));
}

function formatGenre(raw: string, locale: Locale): string {
  // Languages where nouns are routinely capitalised in running text.
  const titleCaseLocales: Locale[] = ["de"];
  if (titleCaseLocales.includes(locale)) {
    return raw.replace(/(^|\s|&|\/)([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return raw.toLowerCase();
}

function formatList(items: string[], conjunction: string): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

import { CaretDownIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { CollapsibleHeight } from "@/components/ui/CollapsibleHeight";
import { usePersistedDisclosure } from "@/components/ui/usePersistedDisclosure";
import { useT } from "@/i18n/localeContext";
import { hasCcTrackDetails } from "@/lib/cc/track-details";
import { formatCount } from "@/lib/format/count";
import { genreSearchHref } from "@/lib/resolve/genre-query";
import type { CcTrackContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

/** localStorage key persisting whether the CC details section is expanded (default collapsed). */
const DETAILS_DISCLOSURE_KEY = "mc:ccDetailsExpanded";

/** A single label/value row in the details section. */
interface DetailRowData {
  /** Stable React key (also the field identity). */
  key: string;
  /** Pre-translated row label. */
  label: string;
  /** Pre-formatted display value (already non-empty — empty rows are filtered out). */
  value: string;
  /** Optional CSS text transform for the value (e.g. `capitalize` for raw Jamendo tags). */
  valueClassName?: string;
  /** When set, the value renders as clickable genre-search links (one per name)
   *  instead of the plain {@link value} text. */
  genreLinks?: string[];
}

/**
 * Renders genre names as inline genre-search links, separated by a middot.
 *
 * Each link points at the homepage genre search ({@link genreSearchHref}); with
 * Astro's ClientRouter the click is a soft navigation, so a genre clicked on a
 * persistent share page (which has no in-page search flow) still lands on the
 * genre results. Raw Jamendo tags are capitalised via CSS only, matching the
 * plain-text rows.
 *
 * @param genres - The genre names (verbatim Jamendo tags).
 */
function GenreLinkList({ genres }: { genres: string[] }) {
  return (
    <span className="mc-txt-recessed-normal min-w-0 text-right text-sm text-text-primary">
      {genres.map((genre, index) => (
        <span key={genre}>
          <a href={genreSearchHref(genre)} className="mc-cardlink capitalize">
            {genre}
          </a>
          {index < genres.length - 1 && <span className="text-text-secondary"> · </span>}
        </span>
      ))}
    </span>
  );
}

/**
 * One label/value row inside a details well: the dimmed label hugs the left, the
 * value hugs the right and may wrap. The value's casing is purely presentational
 * (`valueClassName`) so the underlying Jamendo strings stay verbatim. When
 * `genreLinks` is set the value renders as clickable genre-search links instead.
 *
 * @param label - The pre-translated row label.
 * @param value - The pre-formatted display value.
 * @param valueClassName - Optional CSS transform for the value text.
 * @param genreLinks - When set, render these names as genre-search links.
 */
function DetailRow({ label, value, valueClassName, genreLinks }: Omit<DetailRowData, "key">) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 py-1.5">
      <span className="mc-txt-recessed-dimmed shrink-0 text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      {genreLinks ? (
        <GenreLinkList genres={genreLinks} />
      ) : (
        <span className={cn("mc-txt-recessed-normal min-w-0 text-right text-sm text-text-primary", valueClassName)}>
          {value}
        </span>
      )}
    </div>
  );
}

interface CcTrackDetailsSectionProps {
  content: CcTrackContentConfiguration;
}

/**
 * Creative-Commons track details rendered as a collapsible section at the foot of
 * the media (cover/player) card rather than as its own card.
 *
 * A divider separates it from the player/share block above; a titled toggle row
 * (uppercase "Details" + caret, mirroring the other section headers) expands a
 * {@link CollapsibleHeight} holding Jamendo's `musicinfo` classification (genres,
 * instruments, mood, vocal/instrumental, voice, tempo, character, language) and
 * `stats` counters (listens, downloads, favorites, playlisted, rating). Default
 * collapsed; the state persists across visits.
 *
 * Self-hides (returns `null`) when the track carries no displayable details — and
 * because the divider lives inside, the host card shows nothing extra in that
 * case. Classification values render verbatim from Jamendo (raw English tags),
 * capitalised via CSS only.
 *
 * @param content - The resolved CC track content configuration.
 */
export function CcTrackDetailsSection({ content }: CcTrackDetailsSectionProps) {
  const t = useT();
  const [expanded, toggleExpanded] = usePersistedDisclosure(DETAILS_DISCLOSURE_KEY, false);
  const detailsId = useId();

  if (!hasCcTrackDetails(content)) return null;

  const mi = content.musicInfo;
  const st = content.stats;

  const classRows: DetailRowData[] = mi
    ? (
        [
          {
            key: "genres",
            label: t("cc.details.genres"),
            value: mi.genres.join(" · "),
            valueClassName: "capitalize",
            genreLinks: mi.genres,
          },
          {
            key: "instruments",
            label: t("cc.details.instruments"),
            value: mi.instruments.join(" · "),
            valueClassName: "capitalize",
          },
          { key: "mood", label: t("cc.details.mood"), value: mi.vartags.join(" · "), valueClassName: "capitalize" },
          {
            key: "vocals",
            label: t("cc.details.vocals"),
            value: mi.vocalInstrumental ?? "",
            valueClassName: "capitalize",
          },
          { key: "voice", label: t("cc.details.voice"), value: mi.gender ?? "", valueClassName: "capitalize" },
          { key: "tempo", label: t("cc.details.tempo"), value: mi.speed ?? "", valueClassName: "capitalize" },
          {
            key: "character",
            label: t("cc.details.character"),
            value: mi.acousticElectric ?? "",
            valueClassName: "capitalize",
          },
          { key: "language", label: t("cc.details.language"), value: mi.lang ?? "", valueClassName: "uppercase" },
        ] satisfies DetailRowData[]
      ).filter((r) => r.value)
    : [];

  const statRows: DetailRowData[] = st
    ? (
        [
          { key: "listens", label: t("cc.stats.listens"), value: st.listens > 0 ? formatCount(st.listens) : "" },
          {
            key: "downloads",
            label: t("cc.stats.downloads"),
            value: st.downloads > 0 ? formatCount(st.downloads) : "",
          },
          {
            key: "favorited",
            label: t("cc.stats.favorited"),
            value: st.favorited > 0 ? formatCount(st.favorited) : "",
          },
          {
            key: "playlisted",
            label: t("cc.stats.playlisted"),
            value: st.playlisted > 0 ? formatCount(st.playlisted) : "",
          },
          {
            key: "rating",
            label: t("cc.stats.rating"),
            value: st.notes > 0 ? `${st.avgNote.toFixed(1)} (${formatCount(st.notes)})` : "",
          },
        ] satisfies DetailRowData[]
      ).filter((r) => r.value)
    : [];

  return (
    // The section owns the bottom padding (matching the header's top) so the
    // collapsed title sits centred above the card edge instead of hugging it; the
    // wells therefore carry only horizontal padding.
    <div className="border-t border-white/[0.08] pb-[var(--mc-pad-header,0.75rem)]">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className={cn(
          sectionCardHeaderClassName,
          "flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent text-left",
        )}
      >
        <span className={sectionCardTitleClassName}>{t("cc.details.title")}</span>
        <CaretDownIcon
          weight="bold"
          className={cn("size-4 shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <CollapsibleHeight
        id={detailsId}
        expanded={expanded}
        className="flex flex-col gap-[var(--mc-pad-card,0.75rem)] px-[var(--mc-pad-card,0.75rem)]"
      >
        {classRows.length > 0 && (
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Body className="flex flex-col divide-y divide-white/[0.06] py-1">
              {classRows.map(({ key, ...row }) => (
                <DetailRow key={key} {...row} />
              ))}
            </RecessedCard.Body>
          </RecessedCard>
        )}
        {statRows.length > 0 && (
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Body className="flex flex-col divide-y divide-white/[0.06] py-1">
              {statRows.map(({ key, ...row }) => (
                <DetailRow key={key} {...row} />
              ))}
            </RecessedCard.Body>
          </RecessedCard>
        )}
      </CollapsibleHeight>
    </div>
  );
}

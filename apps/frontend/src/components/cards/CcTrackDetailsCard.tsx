import { CaretDownIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { outerEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SectionCardShell } from "@/components/cards/SectionCardShell";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { usePersistedDisclosure } from "@/components/ui/usePersistedDisclosure";
import { useT } from "@/i18n/localeContext";
import { hasCcTrackDetails } from "@/lib/cc/track-details";
import { formatCount } from "@/lib/format/count";
import type { CcTrackContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

/** localStorage key persisting whether the CC details card is expanded (default collapsed). */
const DETAILS_DISCLOSURE_KEY = "mc:ccDetailsExpanded";

/** A single label/value row in the details card. */
interface DetailRowData {
  /** Stable React key (also the field identity). */
  key: string;
  /** Pre-translated row label. */
  label: string;
  /** Pre-formatted display value (already non-empty — empty rows are filtered out). */
  value: string;
  /** Optional CSS text transform for the value (e.g. `capitalize` for raw Jamendo tags). */
  valueClassName?: string;
}

/**
 * One label/value row inside a details well: the dimmed label hugs the left, the
 * value hugs the right and may wrap. The value's casing is purely presentational
 * (`valueClassName`) so the underlying Jamendo strings stay verbatim.
 *
 * @param label - The pre-translated row label.
 * @param value - The pre-formatted display value.
 * @param valueClassName - Optional CSS transform for the value text.
 */
function DetailRow({ label, value, valueClassName }: Omit<DetailRowData, "key">) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 py-1.5">
      <span className="mc-txt-recessed-dimmed shrink-0 text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <span className={cn("mc-txt-recessed-normal min-w-0 text-right text-sm text-text-primary", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

interface CcTrackDetailsCardProps {
  content: CcTrackContentConfiguration;
  className?: string;
  /** Mirrors the sibling cards' entrance flag so the details block joins the same zoom-in. */
  animated?: boolean;
}

/**
 * Creative-Commons track details card: a titled section showing Jamendo's
 * `musicinfo` classification (genres, instruments, mood, vocal/instrumental,
 * voice, tempo, character, language) and `stats` engagement counters (listens,
 * downloads, favorites, playlisted, average rating).
 *
 * Placed between the media summary card and the {@link import("./CcInfoCard").CcInfoCard}
 * licence card in both share layouts. Self-hides (returns `null`) when the track
 * carries no displayable details, matching {@link hasCcTrackDetails} so the
 * layouts can drop the slot without leaving a gap.
 *
 * Structure mirrors {@link import("./CcInfoCard").CcInfoCard}: a
 * {@link SectionCardShell} with recessed wells — one per group, each rendered
 * only when it has rows — so the geometry/token cascade stays identical to the
 * sibling cards. Classification values render verbatim from Jamendo (raw English
 * tags), capitalised via CSS only.
 *
 * @param content - The resolved CC track content configuration.
 * @param className - Optional extra classes for the outer card.
 * @param animated - When true, plays the shared zoom-in entrance.
 */
export function CcTrackDetailsCard({ content, className, animated = false }: CcTrackDetailsCardProps) {
  const t = useT();
  const [expanded, toggleExpanded] = usePersistedDisclosure(DETAILS_DISCLOSURE_KEY, false);
  const detailsId = useId();

  if (!hasCcTrackDetails(content)) return null;

  const mi = content.musicInfo;
  const st = content.stats;

  const classRows: DetailRowData[] = mi
    ? (
        [
          { key: "genres", label: t("cc.details.genres"), value: mi.genres.join(" · "), valueClassName: "capitalize" },
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
    <SectionCardShell
      title={
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left text-inherit"
        >
          <span>{t("cc.details.title")}</span>
          <CaretDownIcon
            weight="bold"
            className={cn("size-4 shrink-0 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      }
      animated={animated}
      className={cn(outerEmbossedCardClassName, className)}
    >
      <div id={detailsId}>
        <CollapsibleSection
          visible={expanded}
          sectionClass="flex flex-col gap-[var(--mc-pad-card,0.75rem)] p-[var(--mc-pad-card,0.75rem)] pt-0"
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
        </CollapsibleSection>
      </div>
    </SectionCardShell>
  );
}

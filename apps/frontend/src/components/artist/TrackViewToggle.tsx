import { ListIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { EmbossedSegmentedControl, type Segment } from "@/components/ui/EmbossedSegmentedControl";
import { TrackListView } from "@/hooks/useTrackListView";
import { useT } from "@/i18n/localeContext";

interface TrackViewToggleProps {
  /** The currently selected view. */
  view: TrackListView;
  /** Called with the chosen view when the user switches. */
  onChange: (view: TrackListView) => void;
}

/**
 * The mini list/grid switch for an artist-track section, sitting in the card
 * header (desktop) or the well header (mobile). Two icon-only segments drive the
 * section's {@link TrackListView} via the shared {@link EmbossedSegmentedControl};
 * the icons carry the meaning visually while the localized label is exposed only
 * to assistive tech (aria-label) and as a hover tooltip (title).
 *
 * @param view - The currently selected view.
 * @param onChange - Called with the chosen view when the user switches.
 */
export function TrackViewToggle({ view, onChange }: TrackViewToggleProps) {
  const t = useT();
  const segments: Segment<TrackListView>[] = [
    {
      key: TrackListView.List,
      label: "",
      ariaLabel: t("artist.viewList"),
      title: t("artist.viewList"),
      icon: <ListIcon weight="duotone" className="size-[18px]" aria-hidden="true" />,
    },
    {
      key: TrackListView.Grid,
      label: "",
      ariaLabel: t("artist.viewGrid"),
      title: t("artist.viewGrid"),
      icon: <SquaresFourIcon weight="duotone" className="size-[18px]" aria-hidden="true" />,
    },
  ];

  return <EmbossedSegmentedControl segments={segments} value={view} onChange={onChange} compact />;
}

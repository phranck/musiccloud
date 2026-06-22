import { config } from "@fortawesome/fontawesome-svg-core";
import { faCreativeCommons } from "@fortawesome/free-brands-svg-icons";
import { faCopyright } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSyncExternalStore } from "react";
import { EmbossedSegmentedControl, type Segment } from "@/components/ui/EmbossedSegmentedControl";
import { useT } from "@/i18n/localeContext";
import { getResolveMode, setResolveMode, subscribeResolveMode } from "@/lib/resolve/resolveMode";
import { ResolveMode } from "@/lib/types/app";

// Disable Font Awesome's automatic CSS injection — icons are sized via Tailwind,
// and auto-injected styles cause SSR/Astro-island hydration artefacts.
config.autoAddCss = false;

/**
 * Horizontal, icon-only switcher for the resolve mode (Streaming vs. Creative
 * Commons), shown to the left of the hero input on the idle landing page.
 *
 * Uses the standard {@link EmbossedSegmentedControl} so it behaves like an
 * ordinary segmented switch: both cells keep fixed positions (Streaming left, CC
 * right) and the embossed indicator slides to the active one — no reordering. The
 * active mode comes from the shared persistent store (`mc:resolveMode`); the
 * CC-mode green is applied token-conform via the `mc-glass-cc-seg-*` track and
 * indicator surfaces (plus the `data-resolve-mode` scope on the fieldset).
 */
export function ResolveModeSwitcher() {
  const t = useT();
  const mode = useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial);
  const isCc = mode === ResolveMode.Cc;

  const segments: Segment<ResolveMode>[] = [
    {
      key: ResolveMode.Commercial,
      label: "",
      ariaLabel: t("results.modeCommercial"),
      icon: <FontAwesomeIcon icon={faCopyright} className="size-5" aria-hidden />,
    },
    {
      key: ResolveMode.Cc,
      label: "",
      ariaLabel: t("results.modeCc"),
      icon: <FontAwesomeIcon icon={faCreativeCommons} className="size-5" aria-hidden />,
    },
  ];

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" data-resolve-mode={mode}>
      <legend className="sr-only">{t("results.modeLabel")}</legend>
      <EmbossedSegmentedControl
        segments={segments}
        value={mode}
        onChange={setResolveMode}
        trackClassName={isCc ? "mc-glass-cc-seg-track" : undefined}
        indicatorClassName={isCc ? "mc-glass-cc-seg-indicator" : undefined}
      />
    </fieldset>
  );
}

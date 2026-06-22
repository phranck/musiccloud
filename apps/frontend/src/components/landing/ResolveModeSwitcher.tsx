import { config } from "@fortawesome/fontawesome-svg-core";
import { faCreativeCommons } from "@fortawesome/free-brands-svg-icons";
import { faCopyright } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSyncExternalStore } from "react";
import type { Segment } from "@/components/ui/EmbossedSegmentedControl";
import { VerticalSegmentedControl } from "@/components/ui/VerticalSegmentedControl";
import { useT } from "@/i18n/localeContext";
import { getResolveMode, setResolveMode, subscribeResolveMode } from "@/lib/resolve/resolveMode";
import { ResolveMode } from "@/lib/types/app";

// Disable Font Awesome's automatic CSS injection — icons are sized via Tailwind,
// and auto-injected styles cause SSR/Astro-island hydration artefacts.
config.autoAddCss = false;

/**
 * Vertical, icon-only switcher for the resolve mode (Streaming vs. Creative
 * Commons), shown to the left of the hero input on the idle landing page.
 *
 * Built like {@link LanguageSwitcher} on {@link VerticalSegmentedControl}, but in
 * `alwaysExpanded` mode so BOTH options stay permanently visible (no collapse).
 * The active mode comes from the shared persistent store (`mc:resolveMode`); the
 * `data-resolve-mode` scope on the fieldset recolours the accent (blue → CC
 * green) token-conform, matching the hero's CC identity.
 */
export function ResolveModeSwitcher() {
  const t = useT();
  const mode = useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial);

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
      <VerticalSegmentedControl alwaysExpanded segments={segments} value={mode} onChange={setResolveMode} />
    </fieldset>
  );
}

import { config } from "@fortawesome/fontawesome-svg-core";
import { faCreativeCommons } from "@fortawesome/free-brands-svg-icons";
import { faCopyright } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSyncExternalStore } from "react";
import { EmbossedSegmentedControl, type Segment } from "@/components/ui/EmbossedSegmentedControl";
import { resultsCopy } from "@/copy/results";
import { getResolveMode, setResolveMode, subscribeResolveMode } from "@/lib/resolve/resolveMode";
import { ResolveMode } from "@/lib/types/app";

// Disable Font Awesome's automatic CSS injection — icons are sized via Tailwind,
// and auto-injected styles cause SSR/Astro-island hydration artefacts.
config.autoAddCss = false;

const RESOLVE_MODE_SEGMENTS: Segment<ResolveMode>[] = [
  {
    key: ResolveMode.Commercial,
    label: "",
    ariaLabel: resultsCopy.modeCommercial,
    title: resultsCopy.modeCommercial,
    icon: <FontAwesomeIcon icon={faCopyright} className="size-5" aria-hidden />,
  },
  {
    key: ResolveMode.Cc,
    label: "",
    ariaLabel: resultsCopy.modeCreativeCommons,
    title: resultsCopy.modeCreativeCommons,
    icon: <FontAwesomeIcon icon={faCreativeCommons} className="size-5" aria-hidden />,
  },
];

/**
 * Applies a resolve-mode selection and returns focus to the hero input, so the
 * user can keep typing after toggling the mode. The switch is the hero field's
 * leading control and never takes focus itself (EmbossedSegmentedControl
 * preventDefaults its mousedown), so this restores it to the field.
 *
 * @param next - The chosen resolve mode.
 */
function selectResolveMode(next: ResolveMode): void {
  setResolveMode(next);
  document.querySelector<HTMLElement>(".mc-hero-input")?.focus();
}

/**
 * Horizontal, icon-only switcher for the resolve mode (Streaming vs. Creative
 * Commons), shown to the left of the hero input on the idle landing page.
 *
 * Uses the standard {@link EmbossedSegmentedControl} in its `pill` (fully
 * rounded) variant so it behaves like an ordinary segmented switch: both cells
 * keep fixed positions (Streaming left, CC right) and the embossed indicator
 * slides to the active one — no reordering. The
 * active mode comes from the shared persistent store (`mc:resolveMode`); the
 * active segment is filled with the mode accent (blue Streaming / green CC) via
 * `mc-mode-seg-indicator`, switched automatically by the `data-resolve-mode`
 * scope on the fieldset — a clear day+night mode anchor.
 */
export function ResolveModeSwitcher() {
  const mode = useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial);

  return (
    <fieldset className="mc-mode-switch m-0 min-w-0 border-0 p-0" data-resolve-mode={mode}>
      <legend className="sr-only">{resultsCopy.modeLabel}</legend>
      <EmbossedSegmentedControl
        segments={RESOLVE_MODE_SEGMENTS}
        value={mode}
        onChange={selectResolveMode}
        indicatorClassName="mc-glass-seg-indicator mc-mode-seg-indicator"
        pill
      />
    </fieldset>
  );
}

import { type Icon, MonitorIcon, MoonIcon, SunHorizonIcon, SunIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import {
  DayNightMode,
  getDayNightMode,
  setDayNightMode,
  subscribeDayNightMode,
} from "@/components/background/dayNightMode";
import { VerticalSegmentedControl } from "@/components/ui/VerticalSegmentedControl";
import { useT } from "@/i18n/context";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";

/** Display metadata per mode: segment icon, i18n label key, analytics signal. */
const MODE_META: Record<DayNightMode, { icon: Icon; labelKey: string; signal: string }> = {
  [DayNightMode.Day]: { icon: SunIcon, labelKey: "dayNight.day", signal: SkySignal.Day },
  [DayNightMode.Night]: { icon: MoonIcon, labelKey: "dayNight.night", signal: SkySignal.Night },
  [DayNightMode.System]: { icon: MonitorIcon, labelKey: "dayNight.system", signal: SkySignal.System },
  [DayNightMode.Automatic]: { icon: SunHorizonIcon, labelKey: "dayNight.automatic", signal: SkySignal.Automatic },
};

/** Segment order, left to right. */
const MODE_ORDER: readonly DayNightMode[] = [
  DayNightMode.Day,
  DayNightMode.Night,
  DayNightMode.System,
  DayNightMode.Automatic,
];

/** Server snapshot of the mode store: the deterministic SSR default. */
const serverModeSnapshot = () => DayNightMode.Night;

/**
 * Header control switching the night-sky background mode (plan MC-030):
 * Day / Night / System / Automatic, persisted via the shared `dayNightMode`
 * store — the BackgroundScene island subscribes to the same store and plays
 * the actual sky transition.
 *
 * The UI is an icon-only `EmbossedSegmentedControl`: all four modes are
 * persistently visible, each segment carries a decorative (`aria-hidden`)
 * Phosphor icon and falls back to its translated label as the button's
 * accessible name. The control sits in a `<fieldset>` whose visually-hidden
 * `<legend>` names the group via the `dayNight.label` key.
 *
 * The mode binds via `useSyncExternalStore`: SSR renders the Night default,
 * the client snapshot reads the shared store, and React reconciles the
 * stored mode right after hydration. The analytics signal fires only on
 * actual mode CHANGES, mirroring the LanguageSwitcher.
 */
export function DayNightSwitcher() {
  const mode = useSyncExternalStore(subscribeDayNightMode, getDayNightMode, serverModeSnapshot);
  const t = useT();

  const handleChange = (next: DayNightMode) => {
    if (next !== mode) sendMusicSignal(MODE_META[next].signal);
    setDayNightMode(next);
  };

  const segments = MODE_ORDER.map((entry) => {
    const meta = MODE_META[entry];
    const EntryIcon = meta.icon;
    return {
      key: entry,
      label: "",
      ariaLabel: t(meta.labelKey),
      icon: <EntryIcon weight="duotone" className="size-[18px]" aria-hidden="true" />,
    };
  });

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{t("dayNight.label")}</legend>
      <VerticalSegmentedControl segments={segments} value={mode} onChange={handleChange} />
    </fieldset>
  );
}

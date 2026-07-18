import { type Icon, MonitorIcon, MoonIcon, SunHorizonIcon, SunIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import {
  DayNightMode,
  getDayNightMode,
  setDayNightMode,
  subscribeDayNightMode,
} from "@/components/background/dayNightMode";
import { VerticalSegmentedControl } from "@/components/ui/VerticalSegmentedControl";
import { commonCopy } from "@/copy/common";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";

/** Display metadata per mode: segment icon, accessible copy, analytics signal. */
const MODE_META: Record<DayNightMode, { icon: Icon; label: string; help: string; signal: string }> = {
  [DayNightMode.Day]: {
    icon: SunIcon,
    label: commonCopy.dayNight.day,
    help: commonCopy.dayNight.dayHelp,
    signal: SkySignal.Day,
  },
  [DayNightMode.Night]: {
    icon: MoonIcon,
    label: commonCopy.dayNight.night,
    help: commonCopy.dayNight.nightHelp,
    signal: SkySignal.Night,
  },
  [DayNightMode.System]: {
    icon: MonitorIcon,
    label: commonCopy.dayNight.system,
    help: commonCopy.dayNight.systemHelp,
    signal: SkySignal.System,
  },
  [DayNightMode.Automatic]: {
    icon: SunHorizonIcon,
    label: commonCopy.dayNight.automatic,
    help: commonCopy.dayNight.automaticHelp,
    signal: SkySignal.Automatic,
  },
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
 * actual mode changes.
 */
export function DayNightSwitcher() {
  const mode = useSyncExternalStore(subscribeDayNightMode, getDayNightMode, serverModeSnapshot);

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
      ariaLabel: meta.label,
      title: meta.help,
      icon: <EntryIcon weight="duotone" className="size-[18px]" aria-hidden="true" />,
    };
  });

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{commonCopy.dayNight.label}</legend>
      <VerticalSegmentedControl segments={segments} value={mode} onChange={handleChange} />
    </fieldset>
  );
}

import { type Icon, MonitorIcon, MoonIcon, SunHorizonIcon, SunIcon } from "@phosphor-icons/react";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  DayNightMode,
  getDayNightMode,
  setDayNightMode,
  subscribeDayNightMode,
} from "@/components/background/dayNightMode";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useT } from "@/i18n/context";
import { SkySignal, sendMusicSignal } from "@/lib/analytics/umami";

/** Display metadata per mode: trigger/menu icon, i18n label key, analytics signal. */
const MODE_META: Record<DayNightMode, { icon: Icon; labelKey: string; signal: string }> = {
  [DayNightMode.Day]: { icon: SunIcon, labelKey: "dayNight.day", signal: SkySignal.Day },
  [DayNightMode.Night]: { icon: MoonIcon, labelKey: "dayNight.night", signal: SkySignal.Night },
  [DayNightMode.System]: { icon: MonitorIcon, labelKey: "dayNight.system", signal: SkySignal.System },
  [DayNightMode.Automatic]: { icon: SunHorizonIcon, labelKey: "dayNight.automatic", signal: SkySignal.Automatic },
};

/** Menu order, top to bottom. */
const MODE_ORDER: readonly DayNightMode[] = [
  DayNightMode.Day,
  DayNightMode.Night,
  DayNightMode.System,
  DayNightMode.Automatic,
];

/** Server snapshot of the mode store: the deterministic SSR default. */
const serverModeSnapshot = () => DayNightMode.Night;

/**
 * Header dropdown switching the night-sky background mode (plan MC-030):
 * Day / Night / System / Automatic, persisted via the shared `dayNightMode`
 * store — the BackgroundScene island subscribes to the same store and plays
 * the actual sky transition.
 *
 * UI follows the LanguageSwitcher next to it (icon trigger + dark panel).
 * The trigger shows the active mode's icon and names it in the aria-label;
 * menu icons are decorative (`aria-hidden`) next to their visible labels.
 *
 * The mode binds via `useSyncExternalStore`: SSR renders the Night default,
 * the client snapshot reads the shared store, and React reconciles the
 * stored mode right after hydration. The analytics signal fires only on
 * actual mode CHANGES, mirroring the LanguageSwitcher.
 */
export function DayNightSwitcher() {
  const mode = useSyncExternalStore(subscribeDayNightMode, getDayNightMode, serverModeSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const close = () => setIsOpen(false);
  useOutsideClick(containerRef, isOpen, close);

  const ActiveIcon = MODE_META[mode].icon;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-label={`${t("dayNight.label")}: ${t(MODE_META[mode].labelKey)}`}
        aria-expanded={isOpen}
        className="p-2 text-text-primary opacity-70 hover:opacity-100 transition-opacity duration-150 rounded-lg focus:outline-none"
      >
        <ActiveIcon weight="duotone" className="size-[18px]" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 py-1 min-w-[160px] bg-[#1c1c1e] border border-white/[0.08] rounded-xl overflow-hidden z-50">
          {MODE_ORDER.map((entry) => {
            const meta = MODE_META[entry];
            const EntryIcon = meta.icon;
            const active = mode === entry;
            return (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  if (entry !== mode) sendMusicSignal(meta.signal);
                  setDayNightMode(entry);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 focus:outline-none
                  ${active ? "text-white bg-white/[0.08]" : "text-white/50 hover:text-white hover:bg-white/[0.05]"}`}
              >
                <EntryIcon weight="duotone" className="size-4" aria-hidden="true" />
                <span className={active ? "font-medium" : ""}>{t(meta.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

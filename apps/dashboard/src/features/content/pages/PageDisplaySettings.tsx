import {
  OVERLAY_HEIGHTS,
  OVERLAY_WIDTHS,
  type OverlayHeight,
  type OverlayWidth,
  PAGE_DISPLAY_MODES,
  type PageDisplayMode,
} from "@musiccloud/shared";

import { useI18n } from "@/context/I18nContext";

interface Props {
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  onChange: (
    patch: Partial<{
      displayMode: PageDisplayMode;
      overlayWidth: OverlayWidth;
      overlayHeight: OverlayHeight;
    }>,
  ) => void;
}

export function PageDisplaySettings({ displayMode, overlayWidth, overlayHeight, onChange }: Props) {
  const { messages } = useI18n();
  const labels = messages.content.pages.display;
  const modeLabels: Record<PageDisplayMode, string> = {
    fullscreen: labels.fullscreen,
    embossed: labels.embossed,
    translucent: labels.translucent,
  };
  const widthLabels: Record<OverlayWidth, string> = {
    small: labels.widthSmall,
    regular: labels.widthRegular,
    big: labels.widthBig,
  };
  const heightLabels: Record<OverlayHeight, string> = {
    small: labels.heightSmall,
    regular: labels.heightRegular,
    dynamic: labels.heightDynamic,
    expanded: labels.heightExpanded,
  };
  const isOverlay = displayMode !== "fullscreen";

  return (
    <div className="px-6 py-3 flex flex-wrap items-center gap-6 text-xs text-[var(--ds-text-muted)] bg-[var(--ds-surface)] border-t border-[var(--ds-border)]">
      <Picker
        label={labels.displayMode}
        value={displayMode}
        options={PAGE_DISPLAY_MODES.map((m) => ({ value: m, label: modeLabels[m] }))}
        onChange={(v) => onChange({ displayMode: v as PageDisplayMode })}
      />
      {isOverlay && (
        <>
          <Picker
            label={labels.overlayWidth}
            value={overlayWidth}
            options={OVERLAY_WIDTHS.map((w) => ({ value: w, label: widthLabels[w] }))}
            onChange={(v) => onChange({ overlayWidth: v as OverlayWidth })}
          />
          <Picker
            label={labels.overlayHeight}
            value={overlayHeight}
            options={OVERLAY_HEIGHTS.map((h) => ({ value: h, label: heightLabels[h] }))}
            onChange={(v) => onChange({ overlayHeight: v as OverlayHeight })}
          />
        </>
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-medium">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 text-[var(--ds-text)] focus:outline-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

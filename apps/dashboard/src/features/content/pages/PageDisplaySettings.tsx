import {
  OVERLAY_HEIGHTS,
  OVERLAY_WIDTHS,
  type OverlayHeight,
  type OverlayWidth,
  PAGE_DISPLAY_MODES,
  type PageDisplayMode,
} from "@musiccloud/shared";

import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useI18n } from "@/context/I18nContext";
import { FormLabelText } from "@/shared/ui/FormPrimitives";

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
    <div className="px-6 py-3 flex flex-wrap items-end gap-4 bg-[var(--ds-surface)] border-t border-[var(--ds-border)]">
      <Picker<PageDisplayMode>
        label={labels.displayMode}
        value={displayMode}
        options={PAGE_DISPLAY_MODES.map((m) => ({ value: m, label: modeLabels[m] }))}
        onChange={(v) => onChange({ displayMode: v })}
      />
      {isOverlay && (
        <>
          <Picker<OverlayWidth>
            label={labels.overlayWidth}
            value={overlayWidth}
            options={OVERLAY_WIDTHS.map((w) => ({ value: w, label: widthLabels[w] }))}
            onChange={(v) => onChange({ overlayWidth: v })}
          />
          <Picker<OverlayHeight>
            label={labels.overlayHeight}
            value={overlayHeight}
            options={OVERLAY_HEIGHTS.map((h) => ({ value: h, label: heightLabels[h] }))}
            onChange={(v) => onChange({ overlayHeight: v })}
          />
        </>
      )}
    </div>
  );
}

function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col">
      <FormLabelText>{label}</FormLabelText>
      <Dropdown<T> size="sm" value={value} options={options} onChange={onChange} />
    </div>
  );
}

import {
  CONTENT_CARD_STYLES,
  type ContentCardStyle,
  OVERLAY_WIDTHS,
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
  contentCardStyle: ContentCardStyle;
  onChange: (
    patch: Partial<{
      displayMode: PageDisplayMode;
      overlayWidth: OverlayWidth;
      contentCardStyle: ContentCardStyle;
    }>,
  ) => void;
}

export function PageDisplaySettings({ displayMode, overlayWidth, contentCardStyle, onChange }: Props) {
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
  const cardStyleLabels: Record<ContentCardStyle, string> = {
    default: labels.cardStyleDefault,
    recessed: labels.cardStyleRecessed,
  };
  const isOverlay = displayMode !== "fullscreen";
  const isCardStyleVisible = displayMode !== "translucent";

  return (
    <div className="px-3 pt-1 pb-3 flex flex-wrap items-end gap-4 bg-[var(--ds-surface)]">
      <Picker<PageDisplayMode>
        label={labels.displayMode}
        value={displayMode}
        options={PAGE_DISPLAY_MODES.map((m) => ({ value: m, label: modeLabels[m] }))}
        onChange={(v) => onChange({ displayMode: v })}
      />
      {isOverlay && (
        <Picker<OverlayWidth>
          label={labels.overlayWidth}
          value={overlayWidth}
          options={OVERLAY_WIDTHS.map((w) => ({ value: w, label: widthLabels[w] }))}
          onChange={(v) => onChange({ overlayWidth: v })}
        />
      )}
      {isCardStyleVisible && (
        <Picker<ContentCardStyle>
          label={labels.contentCardStyle}
          value={contentCardStyle}
          options={CONTENT_CARD_STYLES.map((s) => ({ value: s, label: cardStyleLabels[s] }))}
          onChange={(v) => onChange({ contentCardStyle: v })}
        />
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

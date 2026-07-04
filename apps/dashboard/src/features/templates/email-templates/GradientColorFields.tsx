import { DashboardInput } from "@musiccloud/dashboard-ui";

import { useI18n } from "@/context/I18nContext";
import type { GradientSwatch } from "@/features/templates/email-templates/gradientSwatches";

interface GradientColorFieldsProps {
  /** Current gradient top colour (hex). */
  top: string;
  /** Current gradient bottom colour (hex). */
  bottom: string;
  /** Called with the next `{ top, bottom }` pair on any edit or preset pick. */
  onChange: (next: { top: string; bottom: string }) => void;
  /** Previously-used gradient pairs offered as one-click presets. */
  swatches: GradientSwatch[];
}

/**
 * Editor for one day/night page-background gradient (MC-079): a top and a
 * bottom colour (native colour picker synced with a hex text field), a live
 * gradient preview, and a row of one-click preset swatches deduplicated from
 * gradients already in use elsewhere ({@link collectGradientSwatches}).
 */
export function GradientColorFields({ top, bottom, onChange, swatches }: GradientColorFieldsProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <ColorField label={m.brandingGradientTop} value={top} onChange={(next) => onChange({ top: next, bottom })} />
        <ColorField
          label={m.brandingGradientBottom}
          value={bottom}
          onChange={(next) => onChange({ top, bottom: next })}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--ds-text-muted)]">{m.preview}</span>
          <div
            className="h-8 w-16 rounded border border-[var(--ds-border)]"
            style={{ backgroundImage: `linear-gradient(180deg, ${top}, ${bottom})` }}
          />
        </div>
      </div>

      {swatches.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--ds-text-muted)]">{m.brandingGradientPresets}</p>
          <div className="flex flex-wrap gap-2">
            {swatches.map((swatch) => (
              <button
                key={`${swatch.top}|${swatch.bottom}`}
                type="button"
                onClick={() => onChange({ top: swatch.top, bottom: swatch.bottom })}
                aria-label={`${swatch.top} → ${swatch.bottom}`}
                title={`${swatch.top} → ${swatch.bottom}`}
                className="h-7 w-10 rounded border border-[var(--ds-border)]"
                style={{ backgroundImage: `linear-gradient(180deg, ${swatch.top}, ${swatch.bottom})` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A single colour input: a native colour swatch and a hex text field kept in
 * sync (both write the same value). The text field lets an admin paste an
 * exact hex; the swatch is the quick visual pick. Validation to a strict hex
 * happens server-side on save.
 */
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--ds-text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-8 w-10 cursor-pointer rounded border border-[var(--ds-border)] bg-transparent"
        />
        <DashboardInput
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="!w-[4.5rem] !px-2 text-xs font-mono"
        />
      </div>
    </div>
  );
}

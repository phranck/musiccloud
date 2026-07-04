import { CaretDownIcon, CaretUpIcon, PaintBrushIcon } from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { SegmentSwitch } from "@/components/ui/SegmentSwitch";
import { useI18n } from "@/context/I18nContext";
import { AssetPickerControl } from "@/features/templates/email-templates/AssetPickerField";
import { GradientColorFields } from "@/features/templates/email-templates/GradientColorFields";
import type { GradientSwatch } from "@/features/templates/email-templates/gradientSwatches";
import type { EmailBranding } from "@/features/templates/hooks/useEmailBranding";
import type { EmailTemplateBranding } from "@/shared/contracts/admin-email-templates";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

/** Segment-switch value namespace for a single override group's mode (project domain-literals policy). */
const BrandingFieldMode = {
  Default: "default",
  Override: "override",
} as const;

interface TemplateBrandingSectionProps {
  /** The template's current branding overrides (each `null` field inherits the global default). */
  branding: EmailTemplateBranding;
  /** Called with the next full overrides object on any edit. */
  onChange: (branding: EmailTemplateBranding) => void;
  /** The global branding default, used to seed a gradient when an override is switched on. */
  global: EmailBranding | undefined;
  /** Previously-used gradient pairs offered as one-click presets. */
  swatches: GradientSwatch[];
}

/**
 * Collapsible per-template branding-override section (MC-079). Each of the
 * five groups (header image, footer image, footer text, day background, night
 * background) has a Default/Override toggle: in "Default" the template inherits
 * the corresponding global branding field; in "Override" the group's editable
 * control appears and its value is persisted on the template.
 *
 * Because `null` means "inherit", turning a group OFF nulls its column(s), and
 * turning a gradient group ON seeds it from the global default so there is a
 * valid gradient to edit. The section is keyed by the template id upstream, so
 * its local mode + open state reset when switching templates.
 */
export function TemplateBrandingSection({ branding, onChange, global, swatches }: TemplateBrandingSectionProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const [open, setOpen] = useState(false);

  // Local override-mode per group, seeded from the incoming branding once (the
  // component remounts when the edited template changes, re-seeding this).
  const [modes, setModes] = useState(() => ({
    header: branding.headerAssetId !== null,
    footerText: branding.footerText !== null,
    day: branding.lightGradientTop !== null || branding.lightBackgroundAssetId !== null,
    night: branding.darkGradientTop !== null || branding.darkBackgroundAssetId !== null,
  }));

  const setField = <K extends keyof EmailTemplateBranding>(key: K, value: EmailTemplateBranding[K]) =>
    onChange({ ...branding, [key]: value });

  const toggleHeader = (on: boolean) => {
    setModes((prev) => ({ ...prev, header: on }));
    if (!on) setField("headerAssetId", null);
  };
  const toggleFooterText = (on: boolean) => {
    setModes((prev) => ({ ...prev, footerText: on }));
    if (!on) setField("footerText", null);
  };
  const toggleDay = (on: boolean) => {
    setModes((prev) => ({ ...prev, day: on }));
    onChange(
      on
        ? {
            ...branding,
            lightGradientTop: branding.lightGradientTop ?? global?.lightGradientTop ?? "#0076d5",
            lightGradientBottom: branding.lightGradientBottom ?? global?.lightGradientBottom ?? "#69d1fd",
          }
        : { ...branding, lightGradientTop: null, lightGradientBottom: null, lightBackgroundAssetId: null },
    );
  };
  const toggleNight = (on: boolean) => {
    setModes((prev) => ({ ...prev, night: on }));
    onChange(
      on
        ? {
            ...branding,
            darkGradientTop: branding.darkGradientTop ?? global?.darkGradientTop ?? "#0b1318",
            darkGradientBottom: branding.darkGradientBottom ?? global?.darkGradientBottom ?? "#10273b",
          }
        : { ...branding, darkGradientTop: null, darkGradientBottom: null, darkBackgroundAssetId: null },
    );
  };

  return (
    <DashboardSection expanded={open}>
      <DashboardSection.Header
        icon={<PaintBrushIcon weight="duotone" className="size-4" />}
        title={m.brandingOverrideTitle}
        renderAddOn={() => (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={m.brandingOverrideTitle}
            className="flex size-6 items-center justify-center rounded text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
          >
            {open ? (
              <CaretUpIcon weight="bold" className="size-4" />
            ) : (
              <CaretDownIcon weight="bold" className="size-4" />
            )}
          </button>
        )}
      />
      <DashboardSection.Body>
        <p className="text-xs text-[var(--ds-text-muted)]">{m.brandingOverrideHint}</p>

        <OverrideGroup title={m.brandingHeaderImage} overridden={modes.header} onModeChange={toggleHeader}>
          <AssetPickerControl assetId={branding.headerAssetId} onAssetChange={(id) => setField("headerAssetId", id)} />
        </OverrideGroup>

        <OverrideGroup title={m.brandingFooterText} overridden={modes.footerText} onModeChange={toggleFooterText}>
          <Suspense
            fallback={
              <div className="h-24 animate-pulse rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]" />
            }
          >
            <MarkdownEditor
              value={branding.footerText ?? ""}
              onChange={(footerText) => setField("footerText", footerText)}
              rows={4}
              resizable
              placeholder={m.brandingFooterTextPlaceholder}
            />
          </Suspense>
        </OverrideGroup>

        <OverrideGroup title={m.brandingLightBackground} overridden={modes.day} onModeChange={toggleDay}>
          <div className="space-y-2">
            <GradientColorFields
              top={branding.lightGradientTop ?? ""}
              bottom={branding.lightGradientBottom ?? ""}
              onChange={(next) =>
                onChange({ ...branding, lightGradientTop: next.top, lightGradientBottom: next.bottom })
              }
              swatches={swatches}
            />
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--ds-text-muted)]">{m.brandingGradientImage}</p>
              <AssetPickerControl
                assetId={branding.lightBackgroundAssetId}
                onAssetChange={(id) => setField("lightBackgroundAssetId", id)}
              />
            </div>
          </div>
        </OverrideGroup>

        <OverrideGroup title={m.brandingDarkBackground} overridden={modes.night} onModeChange={toggleNight}>
          <div className="space-y-2">
            <GradientColorFields
              top={branding.darkGradientTop ?? ""}
              bottom={branding.darkGradientBottom ?? ""}
              onChange={(next) => onChange({ ...branding, darkGradientTop: next.top, darkGradientBottom: next.bottom })}
              swatches={swatches}
            />
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--ds-text-muted)]">{m.brandingGradientImage}</p>
              <AssetPickerControl
                assetId={branding.darkBackgroundAssetId}
                onAssetChange={(id) => setField("darkBackgroundAssetId", id)}
              />
            </div>
          </div>
        </OverrideGroup>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

interface OverrideGroupProps {
  title: string;
  overridden: boolean;
  onModeChange: (override: boolean) => void;
  children: ReactNode;
}

/**
 * One override group row: a title, a Default/Override segmented toggle, and —
 * only while "Override" is selected — the editable control. When "Default" is
 * selected it shows the "inherits global branding" note instead.
 */
function OverrideGroup({ title, overridden, onModeChange, children }: OverrideGroupProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;

  return (
    <div className="space-y-2 rounded-control border border-[var(--ds-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--ds-text)]">{title}</span>
        <SegmentSwitch
          aria-label={title}
          value={overridden ? BrandingFieldMode.Override : BrandingFieldMode.Default}
          onChange={(value) => onModeChange(value === BrandingFieldMode.Override)}
          options={[
            { value: BrandingFieldMode.Default, label: m.brandingModeDefault },
            { value: BrandingFieldMode.Override, label: m.brandingModeOverride },
          ]}
        />
      </div>
      {overridden ? children : <p className="text-xs text-[var(--ds-text-muted)]">{m.brandingInheritsDefault}</p>}
    </div>
  );
}

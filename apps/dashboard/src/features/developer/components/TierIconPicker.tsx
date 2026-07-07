import { TIER_ICONS } from "@musiccloud/shared";
import * as Iconsax from "iconsax-react";
import { useMemo, useState } from "react";
import { FormLabel, formInputClass } from "@/shared/ui/FormPrimitives";

/** The single Iconsax render style the picker (and the portal) uses. */
const ICON_VARIANT = "Bulk" as const;

/** Iconsax component keyed by name; only names in `TIER_ICONS` are rendered. */
type IconComponent = React.ComponentType<{ variant?: string; color?: string; className?: string }>;
const ICONS = Iconsax as unknown as Record<string, IconComponent | undefined>;

/**
 * Renders a single Iconsax glyph by name in the shared Bulk style
 * (`currentColor` so it inherits text colour). Renders nothing for an
 * unknown name.
 *
 * @param name - The Iconsax component name.
 * @param className - Sizing/colour utility classes forwarded to the SVG.
 */
export function TierIconGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name];
  return Icon ? <Icon variant={ICON_VARIANT} color="currentColor" className={className} /> : null;
}

/**
 * Props for {@link TierIconPicker}.
 */
export interface TierIconPickerProps {
  /** Currently selected Iconsax name, or `null` for no icon. */
  value: string | null;
  /** Invoked with the chosen name, or `null` when cleared. */
  onChange: (icon: string | null) => void;
  /** Field label. */
  label: string;
  /** Placeholder for the search input. */
  searchPlaceholder: string;
  /** Label for the "no icon" option and empty state. */
  noneLabel: string;
}

/**
 * Icon field for the tier editor: a trigger button showing the current icon,
 * which toggles an inline panel with a name filter and a scrollable grid of
 * the curated {@link TIER_ICONS} (256 entries). Picking a glyph selects it and
 * closes the panel; a "none" entry clears the icon. Rendered inline (not a
 * portal/popover) so it works inside the tier dialog.
 *
 * @param props - See {@link TierIconPickerProps}.
 */
export function TierIconPicker({ value, onChange, label, searchPlaceholder, noneLabel }: TierIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? TIER_ICONS.filter((name) => name.toLowerCase().includes(q)) : TIER_ICONS;
  }, [query]);

  return (
    <div>
      <FormLabel htmlFor="tier-icon-trigger">{label}</FormLabel>
      <button
        id="tier-icon-trigger"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] px-3 text-sm text-[var(--ds-text)]"
      >
        {value ? (
          <>
            <TierIconGlyph name={value} className="size-5 text-[var(--ds-accent)]" />
            <span className="font-mono text-[var(--ds-text-muted)]">{value}</span>
          </>
        ) : (
          <span className="text-[var(--ds-text-muted)]">{noneLabel}</span>
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-2">
          <input
            type="text"
            className={formInputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <div className="mt-2 grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              title={noneLabel}
              aria-label={noneLabel}
              className={`flex aspect-square items-center justify-center rounded border text-xs text-[var(--ds-text-muted)] ${
                value === null ? "border-[var(--ds-accent)]" : "border-transparent hover:border-[var(--ds-border)]"
              }`}
            >
              ✕
            </button>
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                title={name}
                aria-label={name}
                className={`flex aspect-square items-center justify-center rounded border text-[var(--ds-text)] ${
                  value === name
                    ? "border-[var(--ds-accent)] text-[var(--ds-accent)]"
                    : "border-transparent hover:border-[var(--ds-border)]"
                }`}
              >
                <TierIconGlyph name={name} className="size-5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
